using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Models.Common
{
    public class VerseEntryInfo
    {   
        public VersePointer VersePointer { get; set; }
        public int StartIndex { get; set; }
        public int EndIndex { get; set; }
        public bool EndOfTextDetected { get; set; }
        public bool IsImportantVerse { get; set; }
        public bool IsExcluded { get; set; }
        public bool IsInSquareBrackets { get; set; }

        public bool VersePointerFound
        {
            get
            {
                return VersePointer != null;
            }
        }
    }
}
