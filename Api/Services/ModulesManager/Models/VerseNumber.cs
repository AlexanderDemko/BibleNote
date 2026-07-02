using System;

namespace BibleNote.Services.ModulesManager.Models
{
    [Serializable]
    public struct VerseNumber: IComparable<VerseNumber>
    {
        public int Chapter;
        public int Verse;

        public bool IsChapter
        {
            get
            {
                return Verse == 0;
            }
        }

        public bool IsEmpty
        {
            get
            {
                return Chapter == 0 && Verse == 0;
            }
        }

        public VerseNumber(int chapter, int? verse = null)
        {
            Chapter = chapter;
            Verse = verse.GetValueOrDefault(0);
        }

        public static VerseNumber Parse(string verseNumber)
        {
            var parts = verseNumber.Split(new char[] { ':' }, StringSplitOptions.RemoveEmptyEntries);
            var chapter = int.Parse(parts[0]);
            var verse = parts.Length > 1 ? (int?)int.Parse(parts[1]) : null;

            return new VerseNumber(chapter, verse);
        }
        
        public static VerseNumber ParseTopVerseNumber(string topVerseNumber, VerseNumber verseNumber)
        {
            var parts = topVerseNumber.Split(new char[] { ':' }, StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length > 1)
                return new VerseNumber(int.Parse(parts[0]), int.Parse(parts[1]));
            else
            {
                return verseNumber.IsChapter 
                    ? new VerseNumber(int.Parse(parts[0])) 
                    : new VerseNumber(verseNumber.Chapter, int.Parse(parts[0]));
            }
        }

        public override string ToString()
        {
            if (IsChapter)
                return string.Format("{0}", Chapter);
            else
                return string.Format("{0}:{1}", Chapter, Verse);
        }

        public override int GetHashCode()
        {
            return Chapter.GetHashCode() * 397 ^ Verse.GetHashCode();
        }

        public override bool Equals(object obj)
        {
            if (obj == null)
                return false;

            if (!(obj is VerseNumber))
                return false;

            var otherObj = (VerseNumber)obj;

            return Chapter == otherObj.Chapter && Verse == otherObj.Verse;
        }

        public static bool operator ==(VerseNumber vn1, VerseNumber vn2)
        {
            if (((object)vn1) == null && ((object)vn2) == null)
                return true;

            if (((object)vn1) == null)
                return false;

            if (((object)vn2) == null)
                return false;

            return vn1.Equals(vn2);
        }

        public static bool operator !=(VerseNumber vn1, VerseNumber vn2)
        {
            return !(vn1 == vn2);
        }

        public int CompareTo(VerseNumber other)
        {
            var chapterComparison = Chapter.CompareTo(other.Chapter);
            return chapterComparison != 0 ? chapterComparison : Verse.CompareTo(other.Verse);
        }
    }
}
