using System;
using BibleNote.Analytics.Contracts.VerseParsing;
using BibleNote.Analytics.Models.Verse;
using BibleNote.Analytics.Models.VerseParsing;

namespace BibleNote.Analytics.Services.VerseParsing
{
    public class DocumentParseContext: IDocumentParseContext
    {
        public VersePointer TitleVerse { get; private set; }

        public VerseEntryInfo LatestVerseEntry { get; private set; }        

        public ParagraphContext CurrentParagraph { get; private set; }        

        //public CellInfo CurrentCell { get; private set; }  // Если мы находимсяв таблице. А уже в CellInfo будет ссылка на текущую таблицу.

        public void SetTitleVerse(VersePointer versePointer)
        {
            TitleVerse = versePointer;
        }
        
        public void SetLatestVerseEntry(VerseEntryInfo verseEntry)            
        {
            LatestVerseEntry = verseEntry;
        }

        public void SetCurrentParagraph(ParagraphContext paragraphContext)
        {
            CurrentParagraph = paragraphContext;
        }

        public void SetCurrentParagraphParseResult(ParagraphParseResult paragraphParseResult)
        {
            CurrentParagraph.ParseResult = paragraphParseResult;
        }

        public void EnterElement(ParagraphState paragraphState)
        {
            SetCurrentParagraph(new ParagraphContext(paragraphState, CurrentParagraph));
        }

        public void ExitElement()
        {
            SetCurrentParagraph(CurrentParagraph.ParentParagraph);
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
