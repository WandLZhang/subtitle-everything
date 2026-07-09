package com.k2fsa.sherpa.onnx

import android.content.Context
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * The Cantonese hover/tap dictionary — the same public GCS blob the webplayer tool uses
 * (CC-CEDICT + CC-Canto, trad-keyed). Downloaded once, cached, then kept in memory for
 * forward-maximal-match segmentation + lookup.
 */
object Dict {
    private const val URL_STR =
        "https://storage.googleapis.com/wz-qwen-test-canto-dict/canto-dict.min.json"
    const val MAX_WORD = 8

    @Volatile private var entries: JSONObject? = null

    data class Entry(val py: String, val jy: String, val defs: List<String>)

    fun isLoaded(): Boolean = entries != null

    /** Blocking. Call off the main thread. Returns false on failure (app still works without it). */
    fun load(ctx: Context): Boolean {
        if (entries != null) return true
        return try {
            val f = File(ctx.filesDir, "canto-dict.min.json")
            if (!f.exists() || f.length() < 1_000_000L) download(f)
            entries = JSONObject(f.readText()).getJSONObject("entries")
            true
        } catch (e: Exception) {
            false
        }
    }

    private fun download(f: File) {
        val c = URL(URL_STR).openConnection() as HttpURLConnection
        c.instanceFollowRedirects = true
        c.connectTimeout = 30_000
        c.readTimeout = 120_000
        c.inputStream.use { inp -> f.outputStream().use { out -> inp.copyTo(out) } }
        c.disconnect()
    }

    /** Length of the longest dict word starting at index i, or 0 if none. */
    fun matchLen(text: String, i: Int): Int {
        val e = entries ?: return 0
        var n = minOf(MAX_WORD, text.length - i)
        while (n >= 1) {
            if (e.has(text.substring(i, i + n))) return n
            n--
        }
        return 0
    }

    fun lookup(word: String): List<Entry> {
        val e = entries ?: return emptyList()
        if (!e.has(word)) return emptyList()
        val arr = e.getJSONArray(word)
        val out = ArrayList<Entry>()
        for (k in 0 until arr.length()) {
            val o = arr.getJSONObject(k)
            val d = o.getJSONArray("d")
            val defs = ArrayList<String>()
            for (j in 0 until d.length()) defs.add(d.getString(j))
            out.add(Entry(o.optString("py", ""), o.optString("jy", ""), defs))
        }
        return out
    }
}
