using BibleNote.Analytics.Domain.Entities;
using BibleNote.Analytics.Services.ModulesManager.Models;
using BibleNote.Analytics.Services.VerseParsing.Contracts.ParseResult;
using System.Collections.Generic;
using System.Linq;

namespace BibleNote.Analytics.Services.VerseParsing.Models.ParseResult
{
    public class ParagraphParseResult : ICapacityInfo
    {
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

        public string ParagraphPath { get; set; }

        public bool IsValuable
        {
            get
            {
                return VerseEntries.Any() || NotFoundVerses.Any();
            }
        }

        public List<SimpleVersePointer> NotFoundVerses { get; set; }

        public int ParagraphIndex { get; set; }

        public bool Parsed { get; set; }

        public string Text { get; set; }        

        public int TextLength { get { return Text.Length; } }

        public DocumentParagraph Paragraph { get; set; }

        public List<VerseEntry> VerseEntries { get; set; }

        /// <summary>
        /// Include subverses
        /// </summary>
        public int VersesCount { get; set; }            

        public ParagraphParseResult()
        {
            VerseEntries = new List<VerseEntry>();
            NotFoundVerses = new List<SimpleVersePointer>();            
        }

        public override string ToString()
        {
            return VerseEntries.Count == 1 ? $"{VerseEntries.First().VersePointer}" : $"{VerseEntries.Count} verses in: {Text}";
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
                    foreach (var verseEntry in VerseEntries)
                    {
                        if (chapterVp != null
                            && (verseEntry.VersePointer.BookIndex != chapterVp.BookIndex || verseEntry.VersePointer.Chapter != chapterVp.Chapter))
                        {                            
                            _chapterEntry.Invalid = true;
                            break;
                        }

                        if (chapterVp == null)
                            chapterVp = verseEntry.VersePointer;

                        if (verseEntry.StartIndex == 0)
                            _chapterEntry.AtStartOfParagraph = true;

                        if (verseEntry.VersePointer.MultiVerseType <= MultiVerse.OneChapter)
                        {
                            if (verseEntry.EntryType == VerseEntryType.BookChapter || verseEntry.EntryType == VerseEntryType.BookChapterVerse)
                                _chapterEntry.CorrectType = true;
                        }
                        else
                        {                            
                            _chapterEntry.Invalid = true;
                            break;
                        }
                    }

                    if (chapterVp != null && !_chapterEntry.Invalid)
                        _chapterEntry.ChapterPointer = chapterVp.ToChapterPointer();
                }
            }

            return _chapterEntry;
        }
    }
}
