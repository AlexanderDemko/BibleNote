using BibleNote.Analytics.Models.Modules;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Models.Verse
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
        /// первоначально переданная строка. Может быть пустой.
        /// </summary>
        public string OriginalVerseName { get; set; }

        public VersesListInfo<ModuleVersePointer> SubVerses { get; set; }

        public VersePointer(BibleBookInfo bookInfo, string moduleShortName, string originalVerseName, VerseNumber verseNumber, VerseNumber? topVerseNumber = null)
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
            if (IsMultiVerse > MultiVerse.OneChapter)
                throw new InvalidOperationException("Must be only one chapter in verse.");

            return new ChapterPointer(Book, ModuleShortName, Chapter);
        }
    }
}
