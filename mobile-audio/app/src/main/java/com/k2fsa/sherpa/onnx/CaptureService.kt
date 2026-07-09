package com.k2fsa.sherpa.onnx

import android.app.Activity
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioPlaybackCaptureConfiguration
import android.media.AudioRecord
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Log
import com.github.houbb.opencc4j.util.ZhConverterUtil
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

private const val TAG = "mobile-audio"

/**
 * Foreground service (type mediaProjection) that captures the phone's internal audio,
 * runs it through Silero VAD + SenseVoice, converts to HK-traditional, optionally
 * translates via Gemini, and pushes captions to the floating overlay.
 */
class CaptureService : Service() {
    companion object {
        const val EXTRA_CODE = "code"
        const val EXTRA_DATA = "data"
        private const val CH = "captions"
        private const val NID = 1
        @Volatile var running = false
    }

    private var projection: MediaProjection? = null
    private var record: AudioRecord? = null
    private var overlay: CaptionOverlay? = null
    private var vad: Vad? = null
    private var asr: OfflineRecognizer? = null
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    @Volatile private var capturing = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent == null) { stopSelf(); return START_NOT_STICKY }
        startForegroundNotif()
        val code = intent.getIntExtra(EXTRA_CODE, Activity.RESULT_CANCELED)
        @Suppress("DEPRECATION")
        val data = intent.getParcelableExtra<Intent>(EXTRA_DATA)
        if (code != Activity.RESULT_OK || data == null) { stopSelf(); return START_NOT_STICKY }

        val mpm = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        projection = mpm.getMediaProjection(code, data)
        projection?.registerCallback(object : MediaProjection.Callback() {
            override fun onStop() { stopEverything() }
        }, Handler(Looper.getMainLooper()))

        overlay = CaptionOverlay(this).also { it.show(); it.message("Loading models…") }
        running = true
        scope.launch { initAndRun() }
        return START_STICKY
    }

    private fun startForegroundNotif() {
        val nm = getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= 26) {
            nm.createNotificationChannel(NotificationChannel(CH, "Captions", NotificationManager.IMPORTANCE_LOW))
        }
        val n = Notification.Builder(this, CH)
            .setContentTitle("Subtitle Everything")
            .setContentText("Captioning device audio")
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .build()
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(NID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION)
        } else {
            startForeground(NID, n)
        }
    }

    private fun initAndRun() {
        try {
            Dict.load(this)
            val p = ModelStore.paths(this)
            vad = Vad(
                assetManager = null,
                config = VadModelConfig(
                    sileroVadModelConfig = SileroVadModelConfig(
                        model = p.vad, threshold = 0.5f,
                        minSilenceDuration = 0.25f, minSpeechDuration = 0.25f, windowSize = 512
                    ),
                    sampleRate = 16000, numThreads = 1, provider = "cpu"
                )
            )
            asr = OfflineRecognizer(
                assetManager = null,
                config = OfflineRecognizerConfig(
                    featConfig = getFeatureConfig(sampleRate = 16000, featureDim = 80),
                    modelConfig = OfflineModelConfig(
                        senseVoice = OfflineSenseVoiceModelConfig(
                            model = p.senseVoice, language = "yue", useInverseTextNormalization = true
                        ),
                        tokens = p.tokens, numThreads = 2
                    )
                )
            )
            startCapture()
        } catch (e: Exception) {
            Log.e(TAG, "init failed", e)
            overlay?.message("Init failed: ${e.message}")
        }
    }

    private fun startCapture() {
        val mp = projection ?: return
        val cfg = AudioPlaybackCaptureConfiguration.Builder(mp)
            .addMatchingUsage(AudioAttributes.USAGE_MEDIA)
            .addMatchingUsage(AudioAttributes.USAGE_GAME)
            .addMatchingUsage(AudioAttributes.USAGE_UNKNOWN)
            .build()
        val fmt = AudioFormat.Builder()
            .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
            .setSampleRate(16000)
            .setChannelMask(AudioFormat.CHANNEL_IN_MONO)
            .build()
        val min = AudioRecord.getMinBufferSize(16000, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
        record = AudioRecord.Builder()
            .setAudioFormat(fmt)
            .setBufferSizeInBytes(min * 2)
            .setAudioPlaybackCaptureConfig(cfg)
            .build()
        record?.startRecording()
        capturing = true
        overlay?.message("Listening… play some audio.")
        scope.launch { loop() }
    }

    private fun loop() {
        val v = vad ?: return
        val a = asr ?: return
        val r = record ?: return
        val buf = ShortArray(512)
        while (capturing) {
            val n = r.read(buf, 0, buf.size)
            if (n > 0) {
                val samples = FloatArray(n) { buf[it].toFloat() / 32768.0f }
                v.acceptWaveform(samples)
                while (!v.empty()) {
                    val seg = v.front()
                    v.pop()
                    val raw = decode(a, seg.samples)
                    if (raw.isNotBlank()) {
                        val trad = try { ZhConverterUtil.toTraditional(raw) } catch (e: Exception) { raw }
                        val reading = Prefs.reading(this)
                        val english = if (Prefs.english(this))
                            Translator.translate(trad, Prefs.geminiKey(this)) else null
                        overlay?.update(trad, english, reading)
                    }
                }
            }
        }
    }

    private fun decode(a: OfflineRecognizer, samples: FloatArray): String {
        val s = a.createStream()
        s.acceptWaveform(samples, 16000)
        a.decode(s)
        val t = a.getResult(s).text
        s.release()
        return t
    }

    private fun stopEverything() {
        capturing = false
        running = false
        try { record?.stop(); record?.release() } catch (e: Exception) {}
        record = null
        try { projection?.stop() } catch (e: Exception) {}
        projection = null
        try { overlay?.hide() } catch (e: Exception) {}
        try { vad?.release() } catch (e: Exception) {}
        try { asr?.release() } catch (e: Exception) {}
        if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE) else @Suppress("DEPRECATION") stopForeground(true)
        stopSelf()
    }

    override fun onDestroy() {
        capturing = false
        running = false
        scope.cancel()
        super.onDestroy()
    }
}
