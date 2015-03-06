using BibleNote.Core.Helpers;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Core.Common
{
    public class BibleTranslationDifferencesFormulaBase
    {
        public string OriginalFormula { get; set; }

        public BibleTranslationDifferencesFormulaBase(string originalFormula)
        {
            this.OriginalFormula = originalFormula;

            if (!string.IsNullOrEmpty(originalFormula))
            {
                int indexOfColon = originalFormula.IndexOf(":");

                if (indexOfColon == -1)
                    throw new NotSupportedException(string.Format("Unknown formula: '{0}'", originalFormula));
            }
        }
    }

    public class BibleTranslationDifferencesBaseVersesFormula : BibleTranslationDifferencesFormulaBase
    {
        public int BookIndex { get; set; }
        protected ModuleVersePointer BaseVersePointer { get; set; }
        protected bool IsEmpty { get; set; }
        protected bool EmptyVerseContent { get; set; }
        protected bool SkipCheck { get; set; }

        internal bool IsMultiVerse
        {
            get
            {
                return BaseVersePointer.IsMultiVerse != MultiVerse.None;
            }
        }

        internal int FirstVerse
        {
            get
            {
                return BaseVersePointer.Verse;
            }
        }

        internal int LastVerse
        {
            get
            {
                return BaseVersePointer.TopVerseNumber.GetValueOrDefault().Verse;
            }
        }

        internal int Chapter
        {
            get
            {
                return BaseVersePointer.Chapter;
            }
        }

        //internal int LastChapter
        //{
        //    get
        //    {
        //        return BaseVersePointer.TopVerseNumber.GetValueOrDefault().Chapter;
        //    }
        //}


        public BibleTranslationDifferencesBaseVersesFormula(int bookIndex, string baseVersesFormula, string parallelVersesFormula,
            BibleBookDifference.CorrespondenceVerseType correspondenceType, bool skipCheck, bool emptyVerseContent)
            : base(baseVersesFormula)
        {
            this.BookIndex = bookIndex;
            if (string.IsNullOrEmpty(this.OriginalFormula))
            {
                if (parallelVersesFormula.IndexOfAny(new char[] { 'X', '+' }) != -1)
                    throw new NotSupportedException(string.Format("For empty base verse must be defined concrete parallel verse: '{0}'", parallelVersesFormula));

                int indexOfColon = OriginalFormula.IndexOf(":");
                if (indexOfColon != OriginalFormula.LastIndexOf(":"))
                    throw new NotSupportedException(
                        string.Format("The verses formula with two colons (':') is not supported yet: '{0}'", OriginalFormula));

                Initialize(parallelVersesFormula);
                IsEmpty = true;
            }
            else
                Initialize(baseVersesFormula);

            if (IsMultiVerse && correspondenceType != BibleBookDifference.CorrespondenceVerseType.All)
                throw new NotSupportedException("Multi Base Verses are not supported for not strict processing (when correspondenceType != 'All').");

            this.SkipCheck = skipCheck;
            this.EmptyVerseContent = emptyVerseContent;
        }

        private List<ModuleVersePointer> _allVerses;
        public List<ModuleVersePointer> GetAllVerses()
        {
            if (_allVerses == null)            
                _allVerses = BaseVersePointer.ExpandMultiVerse().VersePointers;            

            return _allVerses;
        }

        private void Initialize(string baseVersesFormula)
        {
            if (baseVersesFormula.IndexOf('(') != -1)
                throw new NotSupportedException(string.Format("Brackets in base formula is not supported yet: {0}", baseVersesFormula));

            BaseVersePointer = new ModuleVersePointer();
            BaseVersePointer.ParseFromFullVerseNumber(baseVersesFormula);
            _allVerses = null;
        }
    }

    public class BibleTranslationDifferencesParallelVersesFormula : BibleTranslationDifferencesFormulaBase
    {
        public abstract class ParallelFormulaPart
        {
            public int? Deviation { get; set; }
            public List<int> ParallelVerses { get; set; }
            public bool? AllVersesArePart { get; set; }

            public string FormulaPart { get; set; }
            public BibleTranslationDifferencesParallelVersesFormula ParallelVersesFormula { get; set; }

            protected int? FirstVerse { get; set; }
            protected int? LastVerse { get; set; }

            public ParallelFormulaPart(string formulaPart, BibleTranslationDifferencesParallelVersesFormula parallelVersesFormula)
            {
                this.FormulaPart = formulaPart;
                this.ParallelVersesFormula = parallelVersesFormula;

                int indexOfX = formulaPart.IndexOf("X");

                if (indexOfX == -1)
                {
                    int indexOfDash = formulaPart.IndexOf("-");
                    if (indexOfDash == -1)   // тогда просто число
                    {
                        ParseSimpleVerse();
                    }
                    else  // тогда диапазон стихов, типа "1-3"
                    {
                        ParseMultiVerse();
                    }
                }
                else  // тогда формула, типа "X+1"
                {
                    ParseFormulaVerse();
                }
            }

            protected virtual void ParseFormulaVerse()
            {
                int? value = StringUtils.GetStringLastNumber(FormulaPart);

                if (!value.HasValue)
                {
                    if (FormulaPart.Length == 1)  // только "X"
                        Deviation = 0;
                    else
                        ThrowUnsupportedFormulaException("x004");
                }
                else
                {
                    Deviation = value.Value;
                }

                if (FormulaPart.IndexOf("+") == -1)
                    Deviation *= -1;
            }

            protected virtual void ParseMultiVerse()
            {
                FirstVerse = StringUtils.GetStringFirstNumber(FormulaPart);
                LastVerse = StringUtils.GetStringLastNumber(FormulaPart);

                if (!FirstVerse.HasValue || !LastVerse.HasValue || FirstVerse.Value == LastVerse.Value)
                    ThrowUnsupportedFormulaException("x002");
            }

            protected virtual void CalculateDeviationForMultiVerseFormula(int firstBaseVerse, int lastBaseVerse)
            {
                Deviation = FirstVerse - firstBaseVerse;

                if (Deviation != (LastVerse - lastBaseVerse))
                    ThrowUnsupportedFormulaException("x003");
            }

            protected virtual void ParseSimpleVerse()
            {
                int value;
                if (!int.TryParse(FormulaPart, out value))
                    ThrowUnsupportedFormulaException("x001");

                ParallelVerses = new List<int>() { int.Parse(FormulaPart) };
            }

            protected virtual void ThrowUnsupportedFormulaException(string errorCode)
            {
                throw new NotSupportedException(string.Format("Not supported parallel verses formula part (errorCode = {0}): '{1}'", errorCode, FormulaPart));
            }
        }

        public class ParallelChapterFormulaPart : ParallelFormulaPart
        {
            public ParallelChapterFormulaPart(string formulaPart, BibleTranslationDifferencesParallelVersesFormula parallelVersesFormula)
                : base(formulaPart, parallelVersesFormula)
            {
            }

            protected override void ParseMultiVerse()
            {
                throw new NotImplementedException();

                //base.ParseMultiVerse();

                //int firstBaseVerse = ParallelVersesFormula.BaseVersesFormula.FirstChapter;
                //int lastBaseVerse = ParallelVersesFormula.BaseVersesFormula.LastChapter;

                //CalculateDeviationForMultiVerseFormula(firstBaseVerse, lastBaseVerse);
            }

            public int CalculateParallelChapter(int baseChapter)
            {
                if (Deviation.HasValue)
                    return baseChapter + Deviation.Value;
                else
                {
                    if (ParallelVerses.Count != 1)
                        ThrowUnsupportedFormulaException("x005");

                    return ParallelVerses[0];
                }
            }
        }

        public class ParallelVersesFormulaPart : ParallelFormulaPart
        {
            protected BibleBookDifference.CorrespondenceVerseType CorrespondenceType { get; set; }
            public int? FirstVersePartIndex { get; set; }
            public int? LastVersePartIndex { get; set; }

            public ParallelVersesFormulaPart(string formulaPart,
                BibleTranslationDifferencesParallelVersesFormula parallelVersesFormula, BibleBookDifference.CorrespondenceVerseType correspondenceType)
                : base(ShellFormula(formulaPart), parallelVersesFormula)
            {
                this.CorrespondenceType = correspondenceType;

                CalculateVersePartIndexes(formulaPart);
            }

            protected virtual void CalculateVersePartIndexes(string formulaPart)
            {
                var parts = formulaPart.Split(new char[] { '-' }, StringSplitOptions.RemoveEmptyEntries);
                if (parts.Length == 1)
                    this.FirstVersePartIndex = GetVersePartIndex(parts[0]);
                else
                {
                    this.FirstVersePartIndex = GetVersePartIndex(parts[0]);
                    this.LastVersePartIndex = GetVersePartIndex(parts[1]);
                }
            }

            private int? GetVersePartIndex(string s)
            {
                var firstStartIndex = s.IndexOf("(");
                if (firstStartIndex != -1)
                {
                    if (Deviation.HasValue)
                        ThrowUnsupportedFormulaException("x006");

                    var result = StringUtils.GetStringFirstNumber(s.Substring(firstStartIndex));
                    if (result.HasValue)
                        result -= 1;

                    return result;
                }
                else
                    return null;
            }

            private static string ShellFormula(string formulaPart)
            {
                var startPartIndex = formulaPart.IndexOf("(");
                if (startPartIndex != -1)
                {
                    var endPartIndex = formulaPart.IndexOf(")", startPartIndex);
                    if (endPartIndex == -1)
                        throw new NotSupportedException(formulaPart);
                    return string.Concat(formulaPart.Substring(0, startPartIndex), ShellFormula(formulaPart.Substring(endPartIndex + 1)));
                }
                else
                    return formulaPart;
            }

            protected override void ParseMultiVerse()
            {
                base.ParseMultiVerse();

                if (!ParallelVersesFormula.BaseVersesFormula.IsMultiVerse)         // например в случае "1:1 -> 1:2-3" 
                {
                    ParallelVerses = new List<int>();
                    for (int i = FirstVerse.Value; i <= LastVerse.Value; i++)
                        ParallelVerses.Add(i);
                }
                else                                                               // например в случае "1:1-2 -> 1:2-3" 
                {
                    int firstBaseVerse = ParallelVersesFormula.BaseVersesFormula.FirstVerse;
                    int lastBaseVerse = ParallelVersesFormula.BaseVersesFormula.LastVerse;

                    CalculateDeviationForMultiVerseFormula(firstBaseVerse, lastBaseVerse);
                }
            }

            protected override void ParseSimpleVerse()
            {
                base.ParseSimpleVerse();

                if (ParallelVersesFormula.BaseVersesFormula.IsMultiVerse)         // например в случае "1:1-2 -> 1:1"                        
                {
                    AllVersesArePart = true;
                }
            }

            public List<int> CalculateParallelVerses(int baseVerse)
            {
                if (Deviation.HasValue)
                    return new List<int>() { baseVerse + Deviation.Value };
                else
                    return ParallelVerses;
            }
        }

        protected BibleTranslationDifferencesBaseVersesFormula BaseVersesFormula { get; set; }
        protected ParallelChapterFormulaPart ChapterFormulaPart { get; set; }
        protected ParallelVersesFormulaPart VersesFormulaPart { get; set; }

        protected BibleTranslationDifferencesParallelVersesFormula SecondFormula { get; set; }  // для случаев <Difference BaseVerses="20:42" ParallelVerses="20:42,21:1" />

        protected bool IsEmpty { get; set; }
        protected bool EmptyVerseContent { get; set; }
        protected BibleBookDifference.CorrespondenceVerseType CorrespondenceType { get; set; }
        protected int? ValueVersesCount { get; set; }
        protected bool SkipCheck { get; set; }

        public BibleTranslationDifferencesParallelVersesFormula(string parallelVersesFormula,
            BibleTranslationDifferencesBaseVersesFormula baseVersesFormula, BibleBookDifference.CorrespondenceVerseType correspondenceType,
            int? valueVersesCount, bool skipCheck, bool emptyVerseContent)
            : base(parallelVersesFormula)
        {
            if (valueVersesCount.HasValue && valueVersesCount == 0)
                throw new NotSupportedException("ValueVersesCount must be greater than 0.");

            if (valueVersesCount.HasValue && correspondenceType == BibleBookDifference.CorrespondenceVerseType.All)
                throw new ArgumentException("CorrespondenceType must not be 'All' if ValueVersesCount defined.");

            this.BaseVersesFormula = baseVersesFormula;
            this.CorrespondenceType = correspondenceType;
            this.ValueVersesCount = valueVersesCount;

            if (!string.IsNullOrEmpty(OriginalFormula))
            {
                int indexOfColon = OriginalFormula.IndexOf(":");

                if (indexOfColon != OriginalFormula.LastIndexOf(":"))
                {
                    var indexOfComma = OriginalFormula.IndexOf(",");
                    if (indexOfComma == -1)
                        throw new NotSupportedException(string.Format("Two colons must be devided by comma: '{0}'", OriginalFormula));

                    if (indexOfComma != OriginalFormula.LastIndexOf(","))
                        throw new NotSupportedException(string.Format("Only one comma is supported: '{0}'", OriginalFormula));

                    var parts = OriginalFormula.Split(new char[] { ',' });
                    this.OriginalFormula = parts[0];
                    SecondFormula = new BibleTranslationDifferencesParallelVersesFormula(
                                            parts[1], this.BaseVersesFormula, this.CorrespondenceType, this.ValueVersesCount, skipCheck, emptyVerseContent);
                }

                ChapterFormulaPart = new ParallelChapterFormulaPart(OriginalFormula.Substring(0, indexOfColon), this);
                VersesFormulaPart = new ParallelVersesFormulaPart(OriginalFormula.Substring(indexOfColon + 1), this, correspondenceType);
            }
            else
            {
                this.IsEmpty = true;
            }

            this.SkipCheck = skipCheck;
            this.EmptyVerseContent = emptyVerseContent;
        }

        public List<ModuleVersePointer> GetParallelVerses(ModuleVersePointer baseVerse, ModuleVersePointer prevVerse)
        {
            var result = new List<ModuleVersePointer>();

            if (IsEmpty)
            {
                result.Add(new ModuleVersePointer(baseVerse) { IsEmpty = true });
            }
            else
            {
                var parallelVerses = VersesFormulaPart.CalculateParallelVerses(baseVerse.VerseNumber.Verse);

                if (!ValueVersesCount.HasValue && CorrespondenceType != BibleBookDifference.CorrespondenceVerseType.All)
                    ValueVersesCount = 1;

                int versePartIndex = prevVerse != null ? prevVerse.PartIndex.GetValueOrDefault(-1) + 1 : 0;
                int verseIndex = 0;
                foreach (var parallelVerse in parallelVerses)
                {
                    var parallelVersePointer = new ModuleVersePointer(
                            baseVerse.BookIndex, ChapterFormulaPart.CalculateParallelChapter(baseVerse.Chapter), parallelVerse);

                    if (VersesFormulaPart.AllVersesArePart.GetValueOrDefault(false))
                        parallelVersePointer.PartIndex = versePartIndex++;

                    if (!VerseIsValue(verseIndex, parallelVerses.Count))
                        parallelVersePointer.IsApocrypha = true;

                    result.Add(parallelVersePointer);
                    verseIndex++;
                }

                if (VersesFormulaPart.FirstVersePartIndex.HasValue)
                    result[0].PartIndex = VersesFormulaPart.FirstVersePartIndex;
                if (VersesFormulaPart.LastVersePartIndex.HasValue)
                    result[result.Count - 1].PartIndex = VersesFormulaPart.LastVersePartIndex;
            }

            if (this.SkipCheck)
                result.ForEach(v => v.SkipCheck = SkipCheck);

            if (this.EmptyVerseContent)
                result.ForEach(v => v.EmptyVerseContent = EmptyVerseContent);

            if (SecondFormula != null)
                result.AddRange(SecondFormula.GetParallelVerses(baseVerse, prevVerse));

            return result;
        }

        private bool VerseIsValue(int verseIndex, int versesCount)
        {

            switch (this.CorrespondenceType)
            {
                case BibleBookDifference.CorrespondenceVerseType.All:
                    return true;
                case BibleBookDifference.CorrespondenceVerseType.First:
                    return verseIndex < ValueVersesCount;
                case BibleBookDifference.CorrespondenceVerseType.Last:
                    return verseIndex >= versesCount - ValueVersesCount;
            }

            return false;
        }
    }
}
