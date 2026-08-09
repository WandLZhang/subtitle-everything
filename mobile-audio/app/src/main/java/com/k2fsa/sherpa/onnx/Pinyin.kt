package com.k2fsa.sherpa.onnx

/**
 * CC-CEDICT stores Mandarin readings with trailing tone digits ("ni3 hao3", "lu:4").
 * Tone marks are what people actually read, so convert for display: ni3 hao3 -> nǐ hǎo.
 *
 * Jyutping is deliberately left as digits — that IS its standard notation; it has no
 * diacritic convention, and Cantonese's six tones don't map onto the four pinyin marks.
 */
object Pinyin {
    // index = tone 1..4, then the toneless form
    private val MARKS = mapOf(
        'a' to "āáǎà", 'e' to "ēéěè", 'i' to "īíǐì", 'o' to "ōóǒò", 'u' to "ūúǔù", 'ü' to "ǖǘǚǜ",
        'A' to "ĀÁǍÀ", 'E' to "ĒÉĚÈ", 'I' to "ĪÍǏÌ", 'O' to "ŌÓǑÒ", 'U' to "ŪÚǓÙ", 'Ü' to "ǕǗǙǛ"
    )

    /** Tone digit of a numbered syllable, 0 if none/neutral. Read it BEFORE accenting. */
    fun toneOf(syllable: String): Int {
        val c = syllable.trim().lastOrNull() ?: return 0
        return if (c.isDigit()) c - '0' else 0
    }

    /** "hao3" -> "hǎo", "lu:4" -> "lǜ", "de5" -> "de". Anything unexpected passes through. */
    fun accent(syllable: String): String {
        var s = syllable.trim()
        if (s.isEmpty()) return s
        s = s.replace("u:", "ü").replace("U:", "Ü")     // CC-CEDICT writes ü as u:
        val last = s.last()
        if (!last.isDigit()) return s
        val tone = last - '0'
        s = s.dropLast(1)
        if (tone !in 1..4) return s                      // 5 / 0 = neutral, no mark
        val i = vowelIndex(s) ?: return s
        val marked = MARKS[s[i]]?.getOrNull(tone - 1) ?: return s
        return s.substring(0, i) + marked + s.substring(i + 1)
    }

    fun accentAll(reading: String): String =
        reading.split(" ").filter { it.isNotBlank() }.joinToString(" ") { accent(it) }

    /** Where the mark goes: 'a' wins, else 'o'/'e', else the last of i/u/ü (so "iu"->u, "ui"->i). */
    private fun vowelIndex(s: String): Int? {
        val l = s.lowercase()
        l.indexOf('a').let { if (it >= 0) return it }
        l.indexOf('o').let { if (it >= 0) return it }
        l.indexOf('e').let { if (it >= 0) return it }
        var last = -1
        for (i in l.indices) if (l[i] == 'i' || l[i] == 'u' || l[i] == 'ü') last = i
        return if (last >= 0) last else null
    }
}
