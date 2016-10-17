using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Models.Verse
{
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
                    return TopVerseNumber.Value.Verse;

                return null;
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

        public ModuleVersePointer(int bookIndex, int chapter, int verse, int? topVerse = null)
            : base(bookIndex, chapter, verse)
        {
            if (topVerse.HasValue)
                TopVerseNumber = new VerseNumber(chapter, topVerse);

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
            Validate();

            var result = new VersesListInfo<ModuleVersePointer>();

            for (var i = Verse; i <= MostTopVerse; i++)
            {
                result.Verses.Add(new ModuleVersePointer(BookIndex, Chapter, i)
                { IsEmpty = IsEmpty, SkipCheck = SkipCheck, EmptyVerseContent = EmptyVerseContent });
            }

            result.VersesCount = result.Verses.Count();

            return result;
        }

        public override object Clone()
        {
            var result = new ModuleVersePointer(this);
            CopyPropertiesTo(result);

            return result;
        }

        public long GetVerseDbId()      // todo: Is this a good place for that method? and try different approaches for serializing/deserializing VerseId.
        {
            return long.Parse($"{BookIndex:D2}{Chapter:D3}{Verse:D3}");
        }
    }
}
