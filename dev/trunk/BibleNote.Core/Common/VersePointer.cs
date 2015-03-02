using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Core.Common
{
    [Serializable]
    public struct VerseNumber : IComparable<VerseNumber>
    {
        public readonly static char[] Dashes = new char[] { '-', '—', '‑', '–' };

        public int Verse;
        public int? TopVerse;
        public bool IsMultiVerse { get { return TopVerse.HasValue; } }

        public bool IsVerseBelongs(int verse)
        {
            if (!IsMultiVerse)
                return Verse == verse;
            else
                return Verse <= verse && verse <= TopVerse.Value;
        }

        public bool IsChapter
        {
            get
            {
                return Verse == 0;
            }
        }

        public VerseNumber(int verse)
        {
            Verse = verse;
            TopVerse = null;
        }

        public VerseNumber(int verse, int? topVerse)
        {
            Verse = verse;
            if (topVerse.GetValueOrDefault(-1) > Verse)
                TopVerse = topVerse;
            else
                TopVerse = null;
        }

        public List<int> GetAllVerses()
        {
            var result = new List<int>();

            result.Add(Verse);

            if (IsMultiVerse)
            {
                for (int i = Verse + 1; i <= TopVerse; i++)
                    result.Add(i);
            }

            return result;
        }

        public static VerseNumber Parse(string s)
        {
            s = s.Trim();
            var parts = s.Split(Dashes, StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length == 1)
                return new VerseNumber(int.Parse(s));
            else if (parts.Length == 2)
                return new VerseNumber(int.Parse(parts[0]), int.Parse(parts[1]));
            else
                throw new NotSupportedException(s);
        }     
      

        public override string ToString()
        {
            if (IsMultiVerse)
                return string.Format("{0}-{1}", Verse, TopVerse);
            else
                return Verse.ToString();
        }

        public override int GetHashCode()
        {
            var result = Verse.GetHashCode();
            //if (TopVerse.HasValue)
            //    result = result ^ TopVerse.Value.GetHashCode();

            return result;
        }

        public override bool Equals(object obj)
        {
            if (obj == null)
                return false;

            if (!(obj is VerseNumber))
                return false;

            var anotherObj = (VerseNumber)obj;

            return this.Verse == anotherObj.Verse
                //&& this.TopVerse == anotherObj.TopVerse
                ;
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

        public static bool operator >(VerseNumber vn1, VerseNumber vn2)
        {
            return vn1.CompareTo(vn2) > 0;
        }

        public static bool operator >=(VerseNumber vn1, VerseNumber vn2)
        {
            return vn1.CompareTo(vn2) >= 0;
        }

        public static bool operator <(VerseNumber vn1, VerseNumber vn2)
        {
            return vn1.CompareTo(vn2) < 0;
        }

        public static bool operator <=(VerseNumber vn1, VerseNumber vn2)
        {
            return vn1.CompareTo(vn2) <= 0;
        }

        public int CompareTo(VerseNumber other)
        {
            return this.Verse.CompareTo(other.Verse);
        }
    }

    [Serializable]
    public class SimpleVersePointer : ICloneable
    {
        public int BookIndex { get; set; }
        public int Chapter { get; set; }
        public VerseNumber VerseNumber { get; set; }                

        public SimpleVersePointer()
        { }

        public SimpleVersePointer(SimpleVersePointer verse)
            : this(verse.BookIndex, verse.Chapter, new VerseNumber(verse.VerseNumber.Verse, verse.VerseNumber.TopVerse))
        { }

        public SimpleVersePointer(int bookIndex, int chapter)
            : this(bookIndex, chapter, new VerseNumber())
        { }

        public SimpleVersePointer(int bookIndex, int chapter, VerseNumber verse)
        {
            this.BookIndex = bookIndex;
            this.Chapter = chapter;
            this.VerseNumber = verse;
        }

        public override bool Equals(object obj)
        {
            if (obj == null)
                return false;

            if (!(obj is SimpleVersePointer))
                return false;

            var other = (SimpleVersePointer)obj;            
            return this.BookIndex == other.BookIndex
                && this.Chapter == other.Chapter
                && this.VerseNumber == other.VerseNumber;
        }

        public override int GetHashCode()
        {
            return this.BookIndex.GetHashCode() ^ this.Chapter.GetHashCode() ^ this.VerseNumber.GetHashCode();
        }

        public override string ToString()
        {
            return string.Format("{0} {1}:{2}", BookIndex, Chapter, VerseNumber);
        }

        public string ToFirstVerseString()
        {
            return string.Format("{0} {1}:{2}", BookIndex, Chapter, VerseNumber.Verse);
        }

        public virtual object Clone()
        {
            var result = new SimpleVersePointer(this);
            CopyPropertiesTo(result);

            return result;
        }

        protected virtual void CopyPropertiesTo(SimpleVersePointer verse)
        {
            
        }

        public SimpleVersePointer GetChapterPointer()
        {
            return new SimpleVersePointer(this.BookIndex, this.Chapter);
        }

        public List<SimpleVersePointer> GetAllVerses()
        {
            var result = new List<SimpleVersePointer>();

            result.AddRange(this.VerseNumber.GetAllVerses().ConvertAll(v =>
            {
                var verse = (SimpleVersePointer)this.Clone();
                verse.VerseNumber = new VerseNumber(v);
                return verse;
            }));

            return result;
        }        
    }

 

    [Serializable]
    public class ModuleVersePointer : SimpleVersePointer
    {
        public int? PartIndex { get; set; }
        public bool IsEmpty { get; set; }            // если true - то стих весь пустой: и текст и номер. Отображается пустая ячейка.
        public bool EmptyVerseContent { get; set; }  // если true - то стихи пустые, и это правильно. Если же false и стих пустой, то это ошибка.
        public bool IsApocrypha { get; set; }
        public bool SkipCheck { get; set; }

        /// <summary>
        /// Часть "бОльшего стиха". Например, если стих :3 а в ibs :2-4 - это один стих. Используется только в одном месте, не везде может быть правильно инициилизировано.
        /// </summary>
        public bool IsPartOfBigVerse { get; set; }

        /// <summary>
        /// У нас есть стих в ibs (Лев 12:7). Ему по смыслу соответствуют два стиха из rst (Лев 12:7-8). Но поделить стих в ibs не поулчается, потому палочка стоит в конце стиха. Но это не значит, что воьсмой стих пустой!
        /// </summary>
        public bool HasValueEvenIfEmpty { get; set; }


        public override string ToString()
        {
            var result = string.Format("{0} {1}:{2}", BookIndex, Chapter, VerseNumber);

            if (PartIndex.HasValue)
                result += string.Format("({0})", PartIndex);

            if (IsEmpty)
                result += "(empty)";

            if (IsApocrypha)
                result += "(A)";

            return result;
        }

        protected override void CopyPropertiesTo(SimpleVersePointer verse)
        {
            if (verse is ModuleVersePointer)
            {
                var moduleVersePointer = ((ModuleVersePointer)verse);
                moduleVersePointer.IsApocrypha = this.IsApocrypha;
                moduleVersePointer.IsEmpty = this.IsEmpty;
                moduleVersePointer.PartIndex = this.PartIndex;
                moduleVersePointer.SkipCheck = this.SkipCheck;
                moduleVersePointer.EmptyVerseContent = this.EmptyVerseContent;
                moduleVersePointer.IsPartOfBigVerse = this.IsPartOfBigVerse;
                moduleVersePointer.HasValueEvenIfEmpty = this.HasValueEvenIfEmpty;
            }
        }
    }

    public class ModuleVerse : ModuleVersePointer
    {
    }

    [Serializable]
    public class VersePointer : SimpleVersePointer
    {
    }
}
