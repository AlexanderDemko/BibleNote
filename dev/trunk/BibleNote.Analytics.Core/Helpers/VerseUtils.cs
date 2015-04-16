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
        private static char[] _chapterVerseDelimiter;
        private static char[] _startVerseChars;
        private static readonly object _locker = new object();
                
        public static char[] GetChapterVerseDelimiters(bool useCommaDelimiter)
        {
            if (_chapterVerseDelimiter == null)
            {
                lock (_locker)
                {
                    if (_chapterVerseDelimiter == null)
                    {
                        var chars = new List<char>() { VerseConstants.DefaultChapterVerseDelimiter };
                        if (useCommaDelimiter)
                            chars.Add(',');

                        _chapterVerseDelimiter = chars.ToArray();
                    }
                }
            }

            return _chapterVerseDelimiter;
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
    }
}
