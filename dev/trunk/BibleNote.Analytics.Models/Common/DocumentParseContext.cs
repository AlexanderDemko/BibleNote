using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Models.Common
{
    public class DocumentParseContext
    {
        public VersePointer TitleVerse { get; set; }

        public VerseEntryInfo LatestVerseEntry { get; set; }        

        public ParagraphParseResult CurrentParagraph { get; set; }

        //public CellInfo CurrentCell { get; set; }  // Если мы находимсяв таблице. А уже в CellInfo будет ссылка на текущую таблицу.

        public void SetTitleVerse(VersePointer versePointer)
        {
            TitleVerse = versePointer;
        }
        
        public void SetLatestVerseEntry(VerseEntryInfo verseEntry)            
        {
            LatestVerseEntry = verseEntry;
        }

        public void SetCurrentParagraph(ParagraphParseResult paragraph)
        {
            CurrentParagraph = paragraph;
        }

        public void EnterTable()
        {
        }

        public void EnterCell()
        {
        }

        /// <summary>
        /// For testing purposes
        /// </summary>
        public void ClearContext()
        {
            this.TitleVerse = null;
            this.LatestVerseEntry = null;
            this.CurrentParagraph = null;            
        }
    }
}
