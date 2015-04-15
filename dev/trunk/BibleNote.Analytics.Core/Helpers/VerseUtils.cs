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
    }
}
