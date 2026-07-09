package com.k2fsa.sherpa.onnx

import android.content.Context
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * Tap dictionary. Two public GCS blobs, chosen by listening language:
 *  - "cn"  (Cantonese + Mandarin): canto-dict, entries {py, jy, d}, both trad+simp keyed.
 *  - "ja"  (Japanese): JMdict, entries {r (kana), d}.
 * Downloaded once, cached, kept in memory for forward-maximal-match segmentation + lookup.
 */
object Dict {
    const val MAX_WORD = 8
    private const val CN_URL = "https://storage.googleapis.com/wz-qwen-test-canto-dict/canto-dict.min.json"
    private const val JA_URL = "https://storage.googleapis.com/wz-qwen-test-canto-dict/ja-dict.min.json"
    // versioned cache names so a format change forces a fresh download
    private const val CN_FILE = "canto-dict-bi.json"
    private const val JA_FILE = "ja-dict.json"

    @Volatile private var entries: JSONObject? = null
    @Volatile private var family = ""   // "cn" or "ja"

    data class Entry(val py: String, val jy: String, val r: String, val defs: List<String>)

    fun isLoaded(): Boolean = entries != null

    private fun familyFor(lang: String) = if (lang == "ja") "ja" else "cn"

    /** Blocking. Loads/downloads the dict for the given language. Returns false on failure. */
    fun loadFor(ctx: Context, lang: String): Boolean {
        val fam = familyFor(lang)
        if (entries != null && family == fam) return true
        return try {
            // remove the pre-v0.3 (trad-only) cache so nothing orphans
            File(ctx.filesDir, "canto-dict.min.json").takeIf { it.exists() }?.delete()
            val (url, name) = if (fam == "ja") JA_URL to JA_FILE else CN_URL to CN_FILE
            val f = File(ctx.filesDir, name)
            if (!f.exists() || f.length() < 1_000_000L) download(url, f)
            entries = JSONObject(f.readText()).getJSONObject("entries")
            family = fam
            true
        } catch (e: Exception) {
            false
        }
    }

    private fun download(url: String, f: File) {
        val c = URL(url).openConnection() as HttpURLConnection
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
            out.add(Entry(o.optString("py", ""), o.optString("jy", ""), o.optString("r", ""), defs))
        }
        return out
    }
}
