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
        private static char[] _wordDelmiters;

        private static readonly object _locker = new object();
                
        public static char[] GetChapterVerseDelimiters(bool useCommaDelimiter)
        {
            if (_chapterVerseDelimiters == null)
            {
                lock (_locker)
                {
                    if (_chapterVerseDelimiters == null)
                    {
                        var chars = new List<char>() { VerseConstants.DefaultChapterVerseDelimiter };
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

        public static char[] GetWordDelimiters()
        {
            if (_wordDelmiters == null)
            {
                lock(_locker)
                {
                    if (_wordDelmiters == null)
                    {
                        _wordDelmiters = new char[] { ' ', ',', '.', ':', '-', '/', '\\', '>', '<', '=' };
                    }
                }
            }

            return _wordDelmiters;
        }
    }
}
