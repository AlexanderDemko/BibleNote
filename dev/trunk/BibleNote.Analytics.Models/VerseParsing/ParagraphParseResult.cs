using BibleNote.Analytics.Models.Verse;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Models.VerseParsing
{
    public class ParagraphParseResult
    {
        public string Text { get; set; }

        public bool Parsed { get; set; }

        private bool _chapterEntryWasSearched;
        private ChapterEntry _chapterEntry;
        public ChapterEntry ChapterEntry
        {
            get
            {
                if (!Parsed)
                    return null;

                if (!_chapterEntryWasSearched)
                {
                    _chapterEntryWasSearched = true;

                    if (!VerseEntries.Any(v => v.VersePointer.IsMultiVerse > MultiVerse.OneChapter))
                    {
                        VersePointer chapterVp = null;
                        var correctEntryType = false;
                        var atStartOfParagraph = false;
                        foreach (var verseEntry in VerseEntries)
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
                            _chapterEntry = new ChapterEntry(chapterVp.ToChapterPointer()) { AtStartOfParagraph = atStartOfParagraph };
                    }
                }

                return _chapterEntry;
            }
        }

        public bool IsValuable
        {
            get
            {
                return VerseEntries.Any() || NotFoundVerses.Any();
            }
        }

        public List<VerseEntry> VerseEntries { get; set; }

        public List<SimpleVersePointer> NotFoundVerses { get; set; }

        public ParagraphParseResult()
        {
            VerseEntries = new List<VerseEntry>();
            NotFoundVerses = new List<SimpleVersePointer>();            
        }
    }
}
