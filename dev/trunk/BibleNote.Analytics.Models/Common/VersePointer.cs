﻿using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Models.Common
{
    public enum MultiVerse
    {
        None = 0,
        OneChapter = 1,
        SeveralChapters = 2
    }

    [Serializable]
    public struct VerseNumber
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

        public VerseNumber(int chapter, int? verse = null)
        {
            Chapter = chapter;
            Verse = verse.GetValueOrDefault(0);            
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
            return Chapter.GetHashCode() ^ Verse.GetHashCode();            
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
    }

    public class VersesListInfo<T> where T : SimpleVersePointer
    {
        public List<T> VersePointers { get; internal set; }
        public int VersesCount { get; internal set; }
    }

    [Serializable]
    public class SimpleVersePointer : ICloneable
    {
        public readonly static char[] Dashes = new char[] { '-', '—', '‑', '–' };

        public int BookIndex { get; set; }        
        public VerseNumber VerseNumber { get; set; }
        public VerseNumber? TopVerseNumber { get; set; }

        public int Chapter { get { return VerseNumber.Chapter; } }
        public int Verse { get { return VerseNumber.Verse; } }

        public MultiVerse IsMultiVerse
        {
            get
            {
                if (TopVerseNumber.HasValue)
                {
                    if (VerseNumber.Chapter == TopVerseNumber.Value.Chapter)
                        return MultiVerse.OneChapter;
                    else
                        return MultiVerse.SeveralChapters;
                }
                else
                    return MultiVerse.None;
            }
        }
        
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
            this.BookIndex = bookIndex;
            this.VerseNumber = verseNumber;
            this.TopVerseNumber = topVerseNumber;
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
            return this.BookIndex.GetHashCode() ^ this.VerseNumber.GetHashCode() ^ this.TopVerseNumber.GetValueOrDefault().GetHashCode();
        }

        /// <summary>
        /// Строка в стихе после названия книги. (*| 5:6, :6, :6-7, 5-6...)
        /// </summary>
        /// <returns></returns>
        public virtual string GetFullVerseNumberString()
        {
            switch (IsMultiVerse)
            {
                case MultiVerse.None:
                    return VerseNumber.ToString();
                case MultiVerse.OneChapter:
                    return string.Format("{0}-{1}", VerseNumber, TopVerseNumber.Value.Verse);
                case MultiVerse.SeveralChapters:
                    return string.Format("{0}-{1}", VerseNumber, TopVerseNumber.Value);
                default:
                    throw new NotImplementedException();
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

        protected virtual void CopyPropertiesTo(SimpleVersePointer verse)
        {
            
        }

        public virtual void ParseFromFullVerseNumber(string fullVerseNumber)
        {
            throw new NotImplementedException();
        }

        public virtual VersesListInfo<SimpleVersePointer> ExpandMultiVerse()
        {
            throw new InvalidOperationException("Can be called only in derived class.");
        }
    }  

    [Serializable]
    public class VersePointer : SimpleVersePointer
    {
        private BibleBookInfo _book;
        public BibleBookInfo Book
        {
            get
            {
                if (_book != null)
                    return _book;

                throw new NotImplementedException();
            }
            set
            {
                _book = value;
            }
        }    

        /// <summary>
        /// первоначально переданная строка в конструктор
        /// </summary>
        public string OriginalVerseName { get; set; }
        public string OriginalBookName { get; set; }

        /// <summary>
        /// Передали "Иуд 2". Исправили ли на "Иуд 1:2"
        /// </summary>
        public bool WasChangedVerseAsOneChapteredBook { get; set; }

        /// <summary>
        /// родительская ссылка. Например если мы имеем дело со стихом диапазона, то здесь хранится стих, являющийся диапазоном
        /// </summary>
        public VersePointer ParentVersePointer { get; set; }

        public override string ToString()
        {
            if (!string.IsNullOrEmpty(this.OriginalVerseName))
                return this.OriginalVerseName;

            if (Book != null)
                return string.Format("{0} {1}", Book.FriendlyShortName, GetFullVerseNumberString());

            return base.ToString();
        }                                

        public virtual VersesListInfo<VersePointer> ExpandMultiVerse()
        {
            throw new NotImplementedException();
        }

        protected override void CopyPropertiesTo(SimpleVersePointer verse)
        {
            throw new NotImplementedException();
        }
    }

 

    /// <summary>
    /// Валиден в рамках одной главы
    /// </summary>
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

        public int? TopVerse
        {
            get
            {
                if (TopVerseNumber.HasValue)
                    return (int?)TopVerseNumber.Value.Verse;

                return null;
            }
            set
            {
                TopVerseNumber = new VerseNumber(Chapter, value);
            }
        }

        public ModuleVersePointer()
            : base()
        {
            Validate();
        }
        
        public ModuleVersePointer(int bookIndex, int chapter)
            : base(bookIndex, chapter)
        {
            Validate();
        }

        public ModuleVersePointer(int bookIndex, int chapter, int verse)
            : base(bookIndex, chapter, verse)
        {
            Validate();
        }

        public ModuleVersePointer(SimpleVersePointer verse)
            : base(verse)
        {
            Validate();
        }

        private void Validate()
        {
            if (IsMultiVerse == MultiVerse.SeveralChapters)
                throw new InvalidOperationException("Only one chapter verses is supported.");
        }

        public override string ToString()
        {
            var result = base.ToString();

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
            base.CopyPropertiesTo(verse);

            if (verse is ModuleVersePointer)
            {
                var moduleVersePointer = (ModuleVersePointer)verse;
                moduleVersePointer.IsApocrypha = this.IsApocrypha;
                moduleVersePointer.IsEmpty = this.IsEmpty;
                moduleVersePointer.PartIndex = this.PartIndex;
                moduleVersePointer.SkipCheck = this.SkipCheck;
                moduleVersePointer.EmptyVerseContent = this.EmptyVerseContent;
                moduleVersePointer.IsPartOfBigVerse = this.IsPartOfBigVerse;
                moduleVersePointer.HasValueEvenIfEmpty = this.HasValueEvenIfEmpty;
            }
        }        

        public virtual VersesListInfo<ModuleVersePointer> ExpandMultiVerse()
        {
            var result = new VersesListInfo<ModuleVersePointer>();

            if (IsMultiVerse == MultiVerse.OneChapter)
            {
                for (var i = Verse; i <= TopVerse; i++)
                {
                    result.VersePointers.Add(new ModuleVersePointer(BookIndex, Chapter, Verse) 
                                                    { IsEmpty = IsEmpty, SkipCheck = SkipCheck, EmptyVerseContent = EmptyVerseContent });
                }
            }

            result.VersesCount = result.VersePointers.Count();

            return result;
        }
    }

    public class ModuleVerse : ModuleVersePointer
    {
        /// <summary>
        /// Строка, соответствующая номерам/номеру стиха. Может быть: "5", "5-6", "6:5-6"
        /// </summary>
        public string VerseNumberString { get; set; }

        /// <summary>
        /// Текст стиха без номера
        /// </summary>
        public string VerseContent { get; set; }    

        public ModuleVerse()
        {
            throw new NotImplementedException();
        }
    }
}