package com.k2fsa.sherpa.onnx

import android.content.Context
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * Downloads the on-device models to filesDir on first run (so they are read from a stable
 * file path, not bundled in the APK). SenseVoice int8 (~230 MB) + tokens + Silero VAD.
 */
object ModelStore {
    data class Paths(val senseVoice: String, val tokens: String, val vad: String)

    private const val HF =
        "https://huggingface.co/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/resolve/main"
    private const val VAD_URL =
        "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.onnx"

    // name, url, minBytes (sanity floor to detect a truncated download)
    private val FILES = listOf(
        Triple("model.int8.onnx", "$HF/model.int8.onnx", 150_000_000L),
        Triple("tokens.txt", "$HF/tokens.txt", 50_000L),
        Triple("silero_vad.onnx", VAD_URL, 500_000L),
    )

    fun dir(c: Context): File = File(c.filesDir, "models").apply { mkdirs() }

    fun paths(c: Context) = Paths(
        File(dir(c), "model.int8.onnx").absolutePath,
        File(dir(c), "tokens.txt").absolutePath,
        File(dir(c), "silero_vad.onnx").absolutePath,
    )

    fun ready(c: Context): Boolean =
        FILES.all { val f = File(dir(c), it.first); f.exists() && f.length() >= it.third }

    /** Blocking. Call off the main thread. Throws on failure. */
    fun ensure(c: Context, onProgress: (String) -> Unit) {
        for ((name, url, min) in FILES) {
            val f = File(dir(c), name)
            if (f.exists() && f.length() >= min) continue
            onProgress("Downloading $name…")
            val tmp = File(dir(c), "$name.part")
            val con = URL(url).openConnection() as HttpURLConnection
            con.instanceFollowRedirects = true
            con.connectTimeout = 30_000
            con.readTimeout = 180_000
            con.inputStream.use { inp -> tmp.outputStream().use { out -> inp.copyTo(out) } }
            con.disconnect()
            if (tmp.length() < min) { tmp.delete(); throw RuntimeException("short download: $name") }
            if (f.exists()) f.delete()
            tmp.renameTo(f)
        }
        onProgress("Models ready.")
    }
}
