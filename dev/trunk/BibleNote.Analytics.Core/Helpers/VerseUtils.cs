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
        private static char[] _startVerseChars;
        private static char[] _wordDelmiters = new char[] { ' ', ',', '.', ':', '-', '/', '\\', '>', '<', '=' };
        private static char[] _midVerseChars = new char[] { '.', ' ', '(' };  // допустимые символы между книгой и главой.
        private static char[] _dashes = new char[] { '-', '—', '‑', '–', '−' };

        private static readonly object _locker = new object();

        public const char DefaultChapterVerseDelimiter = ':';

        public static char[] Dashes
        {
            get
            {
                return _dashes;
            }
        }

        public static char[] WordDelimiters
        {
            get
            {
                return _wordDelmiters;
            }
        }

        public static char[] MidVerseChars
        {
            get
            {          
                return _midVerseChars;
            }
        }

        public static char[] GetChapterVerseDelimiters(bool useCommaDelimiter)
        {
            if (_chapterVerseDelimiters == null)
            {
                lock (_locker)
                {
                    if (_chapterVerseDelimiters == null)
                    {
                        var chars = new List<char>() { DefaultChapterVerseDelimiter };
                        if (useCommaDelimiter)
                            chars.Add(',');

                        _chapterVerseDelimiters = chars.ToArray();
                    }
                }
            }

            return _chapterVerseDelimiters;
        }    
        
        public static char[] GetStartVerseChars(bool useCommaDelimiter)
        {
            if (_startVerseChars == null)
            {
                lock (_locker)
                {
                    if (_startVerseChars == null)
                    {
                        _startVerseChars = new List<char>(GetChapterVerseDelimiters(useCommaDelimiter)) { ',', ';', ' ', '.' }.Distinct().ToArray();
                    }
                }
            }

            return _startVerseChars;
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
