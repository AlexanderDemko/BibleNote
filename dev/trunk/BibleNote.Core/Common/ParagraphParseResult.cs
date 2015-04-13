using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Core.Common
{
    public class ParagraphParseResult
    {
        public string OutputHTML { get; set; }
        public List<VersePointer> Verses { get; set; }
        public List<ParagraphTextPart> TextParts { get; set; }

        public bool LastPartIsVerse { get; set; }
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
    }
}
