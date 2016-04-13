using BibleNote.Analytics.Contracts.VerseParsing;
using BibleNote.Analytics.Models.Common;

namespace BibleNote.Analytics.Services.VerseParsing
{
    public class DocumentParseContext: IDocumentParseContext
    {
        public VersePointer TitleVerse { get; private set; }

        public VerseEntryInfo LatestVerseEntry { get; private set; }        

        public ParagraphParseResult CurrentParagraph { get; private set; }

        //public CellInfo CurrentCell { get; private set; }  // Если мы находимсяв таблице. А уже в CellInfo будет ссылка на текущую таблицу.

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
            TitleVerse = null;
            LatestVerseEntry = null;
            CurrentParagraph = null;            
        }
    }
}
