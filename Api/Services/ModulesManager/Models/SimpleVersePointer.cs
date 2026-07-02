using System;

namespace BibleNote.Services.ModulesManager.Models
{
    public enum MultiVerse
    {
        None = 0,
        OneChapter = 1,
        SeveralChapters = 2
    }

    [Serializable]
    public class SimpleVersePointer : ICloneable, IComparable<SimpleVersePointer>, IComparable
    {
        public static readonly char[] Dashes = new char[] { '-', '—', '‑', '–' };

        public int BookIndex { get; set; }

        public VerseNumber VerseNumber { get; set; }

        public VerseNumber OriginalVerseNumber { get; set; }

        public VerseNumber? TopVerseNumber { get; set; }

        public VerseNumber? OriginalTopVerseNumber { get; set; }

        public int Chapter => VerseNumber.Chapter;

        public int OriginalChapter => OriginalVerseNumber.Chapter;

        public int Verse => VerseNumber.Verse;

        public int OriginalVerse => OriginalVerseNumber.Verse;

        public int MostTopChapter => TopVerseNumber?.Chapter ?? Chapter;

        public int OriginalMostTopChapter => OriginalTopVerseNumber?.Chapter ?? OriginalChapter;

        public int MostTopVerse => TopVerseNumber?.Verse ?? Verse;

        public int OriginalMostTopVerse => OriginalTopVerseNumber?.Verse ?? OriginalVerse;

        public MultiVerse MultiVerseType
        {
            get
            {
                if (TopVerseNumber.HasValue)
                {
                    return VerseNumber.Chapter == TopVerseNumber.Value.Chapter ? MultiVerse.OneChapter : MultiVerse.SeveralChapters;
                }
                else
                    return MultiVerse.None;
            }
        }

        public bool IsChapter => VerseNumber.IsChapter && (!TopVerseNumber.HasValue || TopVerseNumber.Value.IsChapter);

        public SimpleVersePointer()
        { }

        public SimpleVersePointer(SimpleVersePointer verse)
            : this(verse.BookIndex, verse.VerseNumber, verse.TopVerseNumber)
        { }

        public SimpleVersePointer(int bookIndex, int chapter)
            : this(bookIndex, new VerseNumber(chapter, null))
        { }

        public SimpleVersePointer(int bookIndex, int chapter, int verse)
            : this(bookIndex, new VerseNumber(chapter, verse))
        { }

        public SimpleVersePointer(int bookIndex, VerseNumber verseNumber)
            : this(bookIndex, verseNumber, null)
        { }

        public SimpleVersePointer(int bookIndex, VerseNumber verseNumber, VerseNumber? topVerseNumber)
        {
            BookIndex = bookIndex;
            VerseNumber = verseNumber;
            TopVerseNumber = topVerseNumber;
        }

        public void SetChapter(int newChapter)
        {
            VerseNumber = new VerseNumber(newChapter, VerseNumber.Verse);
            if (TopVerseNumber.HasValue && TopVerseNumber.Value.Chapter == 0)
                TopVerseNumber = new VerseNumber(newChapter, TopVerseNumber.Value.Verse);
        }

        /// <summary>
        /// When there was no initial information if it is verse or chapter (for example ",5-6") or when "Иуд 5-6".
        /// </summary>
        /// <param name="newChapter"></param>
        internal virtual void MoveChapterToVerse(int newChapter)
        {
            VerseNumber = new VerseNumber(newChapter, VerseNumber.Chapter);
            if (TopVerseNumber.HasValue && TopVerseNumber.Value.IsChapter)
                TopVerseNumber = new VerseNumber(newChapter, TopVerseNumber.Value.Chapter);
        }

        public override bool Equals(object obj)
        {
            if (obj == null)
                return false;

            if (!(obj is SimpleVersePointer))
                return false;

            var other = (SimpleVersePointer)obj;
            return this.BookIndex == other.BookIndex
                && this.VerseNumber == other.VerseNumber
                && this.TopVerseNumber == other.TopVerseNumber;
        }

        public override int GetHashCode()
        {
            return this.BookIndex.GetHashCode() * 31 ^ this.VerseNumber.GetHashCode() ^ this.TopVerseNumber.GetValueOrDefault().GetHashCode();
        }

        /// <summary>
        /// String in verse after book name (*| 5:6, :6, :6-7, 5-6...)
        /// </summary>
        /// <returns></returns>
        public virtual string GetFullVerseNumberString()
        {
            switch (MultiVerseType)
            {
                case MultiVerse.None:
                    return VerseNumber.ToString();
                case MultiVerse.OneChapter:
                    return string.Format("{0}-{1}", VerseNumber, TopVerseNumber.Value.Verse);
                case MultiVerse.SeveralChapters:
                    return string.Format("{0}-{1}", VerseNumber, TopVerseNumber.Value);
                default:
                    throw new NotSupportedException(MultiVerseType.ToString());
            }
        }

        public override string ToString()
        {
            return string.Format("{0} {1}", BookIndex, GetFullVerseNumberString());
        }

        public virtual object Clone()
        {
            var result = new SimpleVersePointer(this);
            CopyPropertiesTo(result);

            return result;
        }

        public virtual ModuleVersePointer ToModuleVersePointer(bool onlyFirstVerse = false, int? bookIndex = null)
        {
            return new ModuleVersePointer(
                bookIndex ?? BookIndex,
                Chapter,
                Verse,
                !onlyFirstVerse && MultiVerseType == MultiVerse.OneChapter ? (int?)TopVerseNumber.Value.Verse : null);
        }

        protected virtual void CopyPropertiesTo(SimpleVersePointer verse)
        { }

        public int CompareTo(object obj)
        {
            return CompareTo((SimpleVersePointer)obj);
        }
        
        public int CompareTo(SimpleVersePointer other)
        {
            if (ReferenceEquals(this, other)) return 0;
            if (ReferenceEquals(null, other)) return 1;
            var bookIndexComparison = BookIndex.CompareTo(other.BookIndex);
            return bookIndexComparison != 0 ? bookIndexComparison : VerseNumber.CompareTo(other.VerseNumber);
        }
    }
}
