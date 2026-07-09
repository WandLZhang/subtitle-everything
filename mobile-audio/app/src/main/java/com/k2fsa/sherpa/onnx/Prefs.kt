package com.k2fsa.sherpa.onnx

import android.content.Context

/** Tiny SharedPreferences wrapper for the app's settings. */
object Prefs {
    private const val NAME = "mobileaudio"
    private fun sp(c: Context) = c.getSharedPreferences(NAME, Context.MODE_PRIVATE)

    fun geminiKey(c: Context): String = sp(c).getString("gemini_key", "")!!.trim()
    fun setGeminiKey(c: Context, v: String) = sp(c).edit().putString("gemini_key", v.trim()).apply()

    fun english(c: Context): Boolean = sp(c).getBoolean("english", false)
    fun setEnglish(c: Context, v: Boolean) = sp(c).edit().putBoolean("english", v).apply()

    // "jyut" or "pinyin" (Cantonese reading style; ignored for Mandarin/Japanese)
    fun reading(c: Context): String = sp(c).getString("reading", "jyut")!!
    fun setReading(c: Context, v: String) = sp(c).edit().putString("reading", v).apply()

    // listening language: "yue" (Cantonese), "zh" (Mandarin), "ja" (Japanese)
    fun lang(c: Context): String = sp(c).getString("lang", "yue")!!
    fun setLang(c: Context, v: String) = sp(c).edit().putString("lang", v).apply()
}
