using BibleNote.Analytics.Core.Constants;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Core.Helpers
{
    public static class VerseUtils
    {
        private static char[] _chapterVerseDelimiters;        
        private static char[] _wordDelmiters = new char[] { ' ', ',', '.', ':', '-', '/', '\\', '>', '<', '=' };
        private static char[] _midVerseChars = new char[] { '.', ' ', '(' };  // допустимые символы между книгой и главой.
        private static char[] _dashes = new char[] { '-', '—', '‑', '–', '−' };
        private static char[] _startVerseAdditionalChars = new char[] { ',', ';', default(char) };
        private static char[] _defaultChapterVerseDelimiters = new char[] { ':' };
        private static char[] _extendedChapterVerseDelimiters = new char[] { ':', ',' };

        private static readonly object _locker = new object();        

        public static char[] WordDelimiters
        {
            get
            {
                return _wordDelmiters;
            }
        }

        public static bool IsDash(char c)
        {
            return _dashes.Contains(c);            
        }

        public static bool IsWordDelimiter(char c)
        {
            return _wordDelmiters.Contains(c);            
        }

        public static bool IsMidVerseChar(char c)
        {
            return _midVerseChars.Contains(c);            
        }

        /// <summary>
        /// Разделитель главы и стиха
        /// </summary>
        /// <param name="c"></param>
        /// <param name="useCommaDelimiter"></param>
        /// <returns></returns>
        public static bool IsChapterVerseDelimiter(char c, bool useCommaDelimiter)
        {
            if (useCommaDelimiter)
                return _extendedChapterVerseDelimiters.Contains(c);

            return _defaultChapterVerseDelimiters.Contains(c);                       
        }            
        
        public static bool IsStartVerseChar(char c, bool useCommaDelimiter)
        {
            return _startVerseAdditionalChars.Contains(c) || IsChapterVerseDelimiter(c, useCommaDelimiter) || IsMidVerseChar(c);
        }

        // Тестировал производительность. Данный подход самый быстрый.
        public static int GetVerseNumber(char[] digits, int digitsCount)
        {
            switch (digitsCount)
            {
                case 0: return 0;
                case 1: return (int)Char.GetNumericValue(digits[0]);
                case 2: return int.Parse(digits[0].ToString() + digits[1].ToString());
                case 3: return int.Parse(digits[0].ToString() + digits[1].ToString() + digits[2].ToString());
                default: throw new NotSupportedException(string.Format("{0} not supported.", digitsCount));
            }
        }
    }
}
