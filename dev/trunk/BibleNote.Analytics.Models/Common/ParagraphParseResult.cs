using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Models.Common
{
    public class ParagraphParseResult
    {
        public string OutputHTML { get; set; }
        public List<VersePointer> Verses { get; set; }
        public List<ParagraphTextPart> TextParts { get; set; }

        public ParagraphParseResult()
        {
            Verses = new List<VersePointer>();
            TextParts = new List<ParagraphTextPart>();
        }        
    }


    public class ParagraphTextPart
    {
        public enum ParagraphTextPartType
        {
            Verse,
            Text
        }

        public string Text { get; set; }
        public ParagraphTextPartType Type { get; set; }
        public VersePointer Verse { get; set; }

        public int StartIndex { get; set; }
        public int EndIndex { get; set; }
    }
}
