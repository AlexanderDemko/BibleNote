using System;
using System.Collections.Generic;
using System.Linq;
using BibleNote.Services.ModulesManager.Models;
using BibleNote.Services.ModulesManager.Scheme.Module;
using BibleNote.Services.ModulesManager.Scheme.ZefaniaXml;
using Newtonsoft.Json;

namespace BibleNote.Services.VerseParsing.Models
{
    [Serializable]
    public class VersePointer : SimpleVersePointer
    {
        private BibleBookInfo _book;
        public BibleBookInfo Book
        {
            get
            {
                return _book;
            }
            set
            {
                _book = value;
                if (_book != null)
                    BookIndex = _book.Index;
            }
        }

        public string ModuleShortName { get; set; }

        /// <summary>
        /// Original passed verse string. Can be empty.
        /// </summary>
        public string OriginalVerseName { get; set; }

        [JsonIgnore]
        public VersesListInfo<ModuleVersePointer> SubVerses { get; set; }

        public VersePointer(
            BibleBookInfo bookInfo, 
            string moduleShortName, 
            string originalVerseName, 
            VerseNumber verseNumber, 
            VerseNumber? topVerseNumber = null)
            : base(bookInfo != null ? bookInfo.Index : 0, verseNumber, topVerseNumber)
        {
            Book = bookInfo;
            ModuleShortName = moduleShortName;
            OriginalVerseName = originalVerseName;
            SubVerses = new VersesListInfo<ModuleVersePointer>();
        }

        public override string ToString()
        {
            return string.Concat(
                        Book != null ? string.Format("{0} ", Book.FriendlyShortName) : string.Empty,
                        GetFullVerseNumberString());
        }

        public string GetOriginalVerseString()
        {
            if (!string.IsNullOrEmpty(OriginalVerseName))
                return OriginalVerseName;

            return ToString();
        }

        protected override void CopyPropertiesTo(SimpleVersePointer verse)
        {
            throw new NotImplementedException();
        }

        public void UpdateTopVerseNumber(ICollection<ModuleVersePointer> subVerses)
        {
            if (subVerses.Count > 1)
                TopVerseNumber = subVerses.Last().VerseNumber;
            else
                TopVerseNumber = null;
        }

        public virtual ChapterPointer ToChapterPointer()
        {
            if (MultiVerseType > MultiVerse.OneChapter)
                throw new InvalidOperationException("Must be only one chapter in verse.");

            return new ChapterPointer(Book, ModuleShortName, Chapter);
        }
        
        /// <summary>
        /// You should be careful after call this method: versePointer can be in inconsistent state - IsMultiVerse and TopVerseNumber can return not actual information.
        /// Probably should call UpdateTopVerseNumber() after.
        /// </summary>
        /// <param name="versePointer"></param>
        public void ExpandVerse(XMLBIBLE bibleContent)
        {
            var bookContent = bibleContent.BooksDictionary[BookIndex];
            for (var chapterIndex = Chapter; chapterIndex <= MostTopChapter; chapterIndex++)
            {
                if (bookContent.Chapters.Count < chapterIndex)
                {
                    SubVerses.NotFoundVerses.Add(new ModuleVersePointer(BookIndex, chapterIndex));
                    break;
                }

                var chapterContent = bookContent.Chapters[chapterIndex - 1];
                if ((Chapter < chapterIndex
                            || (VerseNumber.IsChapter && Chapter == chapterIndex))
                    && (!TopVerseNumber.HasValue 
                        || (chapterIndex < MostTopChapter
                                || (TopVerseNumber.Value.IsChapter && MostTopChapter == chapterIndex))))
                {
                    SubVerses.Verses.Add(new ModuleVersePointer(BookIndex, chapterIndex));
                    SubVerses.VersesCount += IsChapter ? 1 : chapterContent.Verses.Count;
                }
                else
                {
                    var startVerse = chapterIndex == Chapter ? Verse : 1;
                    var endVerse = chapterIndex == MostTopChapter ? MostTopVerse : chapterContent.Verses.Count;

                    for (var verseIndex = startVerse; verseIndex <= endVerse; verseIndex++)
                    {
                        var verse = new ModuleVersePointer(BookIndex, chapterIndex, verseIndex);
                        if (chapterContent.Verses.Count < verseIndex)
                        {
                            SubVerses.NotFoundVerses.Add(verse);
                            break;
                        }

                        SubVerses.Verses.Add(verse);
                        SubVerses.VersesCount++;
                    }
                }
            }
        }
    }
}
