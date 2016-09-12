using BibleNote.Analytics.Contracts.VerseParsing;
using BibleNote.Analytics.Contracts.VerseParsing.ParseContext;
using BibleNote.Analytics.Core.Extensions;
using BibleNote.Analytics.Models.Verse;
using BibleNote.Analytics.Models.VerseParsing;
using System.Collections.Generic;
using System.Linq;

namespace BibleNote.Analytics.Services.VerseParsing.ParseContext
{
    public class HierarchyElementParseContext : IHierarchyElementParseContext
    {
        public ParagraphState ParagraphState { get; set; }

        public IHierarchyInfo HierarchyInfo { get; set; }

        public ChapterEntryInfo ChapterPointer { get; private set; }

        public List<ParagraphParseResult> ParseResults { get; private set; }

        public IHierarchyElementParseContext ParentHierarchy { get; private set; }

        public HierarchyElementParseContext(ParagraphState paragraphState, IHierarchyElementParseContext parentHierarchy)
        {
            ParagraphState = paragraphState;
            ParentHierarchy = parentHierarchy;

            ParseResults = new List<ParagraphParseResult>();
        }

        private bool _chapterWasSearched;
        public void TrySetChapterPointerFromParseResults()
        {
            if (_chapterWasSearched)
                return;

            if (!ParseResults.Any(r => r.VerseEntries.Any(v => v.VersePointer.IsMultiVerse > MultiVerse.OneChapter)))
            {
                VersePointer chapterVp = null;
                var correctEntryType = false;
                var atStartOfParagraph = false;
                foreach (var verseEntry in ParseResults.SelectMany(r => r.VerseEntries))
                {
                    if (chapterVp != null
                        && (verseEntry.VersePointer.BookIndex != chapterVp.BookIndex || verseEntry.VersePointer.Chapter != chapterVp.Chapter))
                    {
                        chapterVp = null;
                        break;
                    }

                    if (chapterVp == null)                    
                        chapterVp = verseEntry.VersePointer;

                    if (verseEntry.EntryType == VerseEntryType.BookChapter || verseEntry.EntryType == VerseEntryType.BookChapterVerse)
                        correctEntryType = true;

                    if (verseEntry.StartIndex == 0)
                        atStartOfParagraph = true;
                }

                if (chapterVp != null && correctEntryType)
                    ChapterPointer = new ChapterEntryInfo(chapterVp.ToChapterPointer()) { AtStartOfParagraph = atStartOfParagraph };
            }

            _chapterWasSearched = true;
        }
        
        public ChapterEntryInfo GetHierarchyChapterPointer()
        {
            if (ChapterPointer == null)
            {
                ChapterEntryInfo _calculatedChapterPointer = null;

                if (ParagraphState == ParagraphState.TableCell)
                {
                    var hierarchyInfo = (TableHierarchyInfo)ParentHierarchy.ParentHierarchy.HierarchyInfo;
                    if (hierarchyInfo.CurrentRow > 0)
                        _calculatedChapterPointer = hierarchyInfo.FirstRowChapters.TryGetAt(hierarchyInfo.CurrentColumn);

                    if (_calculatedChapterPointer == null && hierarchyInfo.CurrentColumn > 0)
                        _calculatedChapterPointer = hierarchyInfo.FirstColumnChapters.TryGetAt(hierarchyInfo.CurrentRow);
                }

                if (_calculatedChapterPointer != null)
                    ChapterPointer = _calculatedChapterPointer.CloneAsCalculated();
            }

            return ChapterPointer ?? ParentHierarchy?.GetHierarchyChapterPointer();
        }      
    }
}
