using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Models.Common
{
    public class DocumentParseContext
    {
        public VerseEntryType LatestVerseEntry { get; set; }

        public ParagraphTextPart CurrentParagraphTextPart { get; set; }

        public ParagraphParseResult CurrentParagraph { get; set; }

        //public CellInfo CurrentCell { get; set; }  // Если мы находимсяв таблице. А уже в CellInfo будет ссылка на текущую таблицу.

        
        public void FoundVersePointer()
        {
        }

        public void EnterParagraph()
        {
        }

        public void EnterParagraphTextPart()
        {
        }

        public void EnterTable()
        {
        }

        public void EnterCell()
        {

        }
    }
}
