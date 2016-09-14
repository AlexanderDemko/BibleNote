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

                return GetChapterEntry();              
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

        public override string ToString()
        {
            return $"{VerseEntries.Count} verses in: {Text}";
        }

        private ChapterEntry GetChapterEntry()
        {
            if (!_chapterEntryWasSearched)
            {
                _chapterEntryWasSearched = true;

                if (VerseEntries.Any())
                {
                    _chapterEntry = new ChapterEntry();

                    VersePointer chapterVp = null;
                    var correctEntryType = false;
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

                        if (verseEntry.StartIndex == 0)
                            _chapterEntry.AtStartOfParagraph = true;

                        if (verseEntry.VersePointer.IsMultiVerse <= MultiVerse.OneChapter)
                        {
                            if (verseEntry.EntryType == VerseEntryType.BookChapter || verseEntry.EntryType == VerseEntryType.BookChapterVerse)
                                correctEntryType = true;
                        }
                        else
                        {
                            correctEntryType = false;
                            break;
                        }
                    }

                    if (chapterVp != null && correctEntryType)
                        _chapterEntry.ChapterPointer = chapterVp.ToChapterPointer();
                }
            }

            return _chapterEntry;
        }
    }
}
