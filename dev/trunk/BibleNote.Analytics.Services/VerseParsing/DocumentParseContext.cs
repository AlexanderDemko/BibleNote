using System.Linq;
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

        public HierarchyContext CurrentHierarchy { get; private set; }

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

            if (CurrentHierarchy != null)
                CurrentHierarchy.ParseResults.Add(paragraphParseResult);
        }

        public void EnterHierarchyElement(ParagraphState paragraphState)
        {
            CurrentHierarchy = new HierarchyContext(paragraphState, CurrentHierarchy);            
        }

        public void ExitHierarchyElement()
        {
            if (CurrentHierarchy.ParagraphState == ParagraphState.Title)
            {
                if (CurrentHierarchy.ParseResults.SelectMany(r => r.VerseEntries).Count() == 1)
                {
                    var result = CurrentHierarchy.ParseResults.Single(r => r.VerseEntries.Any());
                    var titleVerse = result.VerseEntries.First().VersePointer;
                    if (titleVerse.IsMultiVerse <= MultiVerse.OneChapter)
                        SetTitleVerse(titleVerse);
                };
            }

            CurrentHierarchy = CurrentHierarchy.ParentHierarchy;
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
