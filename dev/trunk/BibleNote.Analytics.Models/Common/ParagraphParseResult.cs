using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Models.Common
{
    public class ParagraphParseResult
    {   
        public List<ParagraphTextPart> TextParts { get; set; }

        public ParagraphParseResult()
        {            
            TextParts = new List<ParagraphTextPart>();            
        }
        public IEnumerable<VersePointer> GetAllVerses()
        {
            return TextParts.SelectMany(tp => tp.VerseEntries.Select(ve => ve.VersePointer));
        }
    }


    public class ParagraphTextPart
    {   
        public string Text { get; set; }
        public List<VerseEntryInfo> VerseEntries { get; set; }        

        public ParagraphTextPart(string text)
        {
            Text = text;
            VerseEntries = new List<VerseEntryInfo>();
        }
    }
}
