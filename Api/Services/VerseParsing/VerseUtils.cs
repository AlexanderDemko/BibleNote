using System;
using System.Linq;

namespace BibleNote.Services.VerseParsing
{
    public static class VerseUtils
    {
        // Now we support only two spaces: 32 и 160. It is required in two collections here and in method ModuleInfo.GetBibleBook(). 
        // If there will be more supported spaces, then it would be appropriate to allocate separate collection.

        private static char[] _wordDelmiters = new char[] { ' ', ' ', ',', '.', ':', '-', '/', '\\', '>', '<', '=', '(', ')', '*', '\'', '"', '\n' };
        private static char[] _midVerseChars = new char[] { '.', ' ', ' ', '(' };  // Allowable symbols between book and chapter
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
        /// Chapter and verse delimiter
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

        // I have tested the performance. This approach is the fastest.
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
