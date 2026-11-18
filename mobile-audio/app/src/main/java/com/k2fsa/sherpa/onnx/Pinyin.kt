package com.k2fsa.sherpa.onnx

/**
 * CC-CEDICT stores Mandarin readings with trailing tone digits ("ni3 hao3", "lu:4").
 * Tone marks are what people actually read, so convert for display: ni3 hao3 -> nǐ hǎo.
 *
 * Jyutping is deliberately left as digits — that IS its standard notation; it has no
 * diacritic convention, and Cantonese's six tones don't map onto the four pinyin marks.
 *
 * Same logic as browser-dictionary/dict-core.js, which carries the tests.
 */
object Pinyin {
    private fun row(marks: String) = marks.map { it.toString() }

    // index = tone 1..4. The nasal rows are spelled out because n̄ and the m marks are a letter
    // plus a combining mark, two code points each.
    private val MARKS: Map<Char, List<String>> = mapOf(
        'a' to row("āáǎà"), 'e' to row("ēéěè"), 'i' to row("īíǐì"), 'o' to row("ōóǒò"), 'u' to row("ūúǔù"), 'ü' to row("ǖǘǚǜ"),
        'A' to row("ĀÁǍÀ"), 'E' to row("ĒÉĚÈ"), 'I' to row("ĪÍǏÌ"), 'O' to row("ŌÓǑÒ"), 'U' to row("ŪÚǓÙ"), 'Ü' to row("ǕǗǙǛ"),
        'n' to listOf("n\u0304", "ń", "ň", "ǹ"), 'm' to listOf("m\u0304", "ḿ", "m\u030C", "m\u0300"),
        'N' to listOf("N\u0304", "Ń", "Ň", "Ǹ"), 'M' to listOf("M\u0304", "Ḿ", "M\u030C", "M\u0300")
    )

    /** Tone digit of a numbered syllable, 0 if none/neutral. Read it BEFORE accenting. */
    fun toneOf(syllable: String): Int {
        val c = syllable.trim().lastOrNull() ?: return 0
        return if (c.isDigit()) c - '0' else 0
    }

    /** "hao3" -> "hǎo", "lu:4" and "lv4" -> "lǜ", "n2" -> "ń", "de5" -> "de". Anything else passes through. */
    fun accent(syllable: String): String {
        val orig = syllable.trim()
        val last = orig.lastOrNull() ?: return orig
        if (last !in '0'..'9') return orig                 // no tone digit: a letter, a word, punctuation
        // CC-CEDICT writes ü as "u:" and CC-Canto often as "v" (nv3, lv4). Convert only inside a
        // toned syllable, so a bare "V" (V領) stays a V.
        val s = orig.dropLast(1).replace("u:", "ü").replace("U:", "Ü").replace("v", "ü").replace("V", "Ü")
        if (s.none { it in 'a'..'z' || it in 'A'..'Z' || it == 'ü' || it == 'Ü' }) return orig  // 雙11 keeps its digits
        val tone = last - '0'
        if (tone !in 1..4) return s                        // 5 / 0 = neutral, no mark
        val i = vowelIndex(s) ?: return orig
        val marked = MARKS[s[i]]?.getOrNull(tone - 1) ?: return orig
        return s.substring(0, i) + marked + s.substring(i + 1)
    }

    /**
     * Readings are space-separated, but CC-Canto glues some syllables together (yi1ju4) and leaves
     * punctuation on others (da3,). Cutting after each tone digit gives every syllable its own mark
     * and colour.
     */
    fun syllables(reading: String): List<String> {
        val out = ArrayList<String>()
        for (tok in reading.split(" ")) {
            val cur = StringBuilder()
            for (i in tok.indices) {
                cur.append(tok[i])
                val digit = tok[i] in '0'..'9'
                val nextDigit = i + 1 < tok.length && tok[i + 1] in '0'..'9'
                if (digit && !nextDigit) { out.add(cur.toString()); cur.setLength(0) }
            }
            if (cur.isNotEmpty()) out.add(cur.toString())
        }
        return out
    }

    fun accentAll(reading: String): String = syllables(reading).joinToString(" ") { accent(it) }

    /**
     * Where the mark goes: 'a' wins, else 'o'/'e', else the last of i/u/ü (so "iu"->u, "ui"->i).
     * No vowel means a syllabic nasal (唔 n2, 呣 m2, ng2), which takes the mark on the n or m.
     */
    private fun vowelIndex(s: String): Int? {
        val l = s.lowercase()
        for (v in "aoe") { val i = l.indexOf(v); if (i >= 0) return i }
        var last = -1
        for (i in l.indices) if (l[i] == 'i' || l[i] == 'u' || l[i] == 'ü') last = i
        if (last >= 0) return last
        val n = l.indexOf('n')
        val m = l.indexOf('m')
        val k = if (n < 0) m else if (m < 0) n else minOf(n, m)
        return if (k >= 0) k else null
    }
}
