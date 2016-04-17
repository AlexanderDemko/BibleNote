using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Models.Common
{
    public class ParallelBibleInfo : Dictionary<int, ModuleVersePointersComparisonTable>
    {
        public new ModuleVersePointersComparisonTable this[int bookIndex]
        {
            get
            {
                if (base.ContainsKey(bookIndex))
                    return base[bookIndex];

                return null;
            }
        }
    }

    public class ComparisonVersesInfo : List<ModuleVersePointer>
    {
        public ComparisonVersesInfo()
        {
        }

        public ComparisonVersesInfo(List<ModuleVersePointer> verses)
            : base(verses)
        {
        }

        public static ComparisonVersesInfo FromVersePointer(ModuleVersePointer versePointer)
        {
            return new ComparisonVersesInfo() { versePointer };
        }
    }

    public class ModuleVersePointersComparisonTable : Dictionary<ModuleVersePointer, ComparisonVersesInfo>
    {
        public new void Add(ModuleVersePointer key, ComparisonVersesInfo value)
        {
            if (!this.ContainsKey(key))
                base.Add(key, value);
            else
                base[key].AddRange(value);
        }

        private Dictionary<ModuleVersePointer, ModuleVersePointer> _keys;
        public SimpleVersePointer GetOriginalKey(ModuleVersePointer key)
        {
            if (_keys == null)
            {
                _keys = new Dictionary<ModuleVersePointer, ModuleVersePointer>();
                foreach (var k in this.Keys)
                {
                    _keys.Add(k, k);
                }
            }

            if (_keys.ContainsKey(key))
                return _keys[key];

            return null;
        }
    }

    public class BibleTranslationDifferencesEx
    {
        public ParallelBibleInfo BibleVersesDifferences { get; set; }

        public BibleTranslationDifferencesEx(BibleTranslationDifferences translationDifferences, Func<string, ModuleVersePointer> verseFactory)
        {
            BibleVersesDifferences = new ParallelBibleInfo();

            foreach (var bookDifferences in translationDifferences.BookDifferences)
            {
                BibleVersesDifferences.Add(bookDifferences.BookIndex, new ModuleVersePointersComparisonTable());

                foreach (var bookDifference in bookDifferences.Differences)
                {
                    ProcessBookDifference(bookDifferences.BookIndex, bookDifference, verseFactory);
                }
            }
        }

        private void ProcessBookDifference(int bookIndex, BibleBookDifference bookDifference, Func<string, ModuleVersePointer> verseFactory)
        {
            int? valueVersesCount = string.IsNullOrEmpty(bookDifference.ValueVersesCount) ? (int?)null : int.Parse(bookDifference.ValueVersesCount);

            var baseVersesFormula = new BibleTranslationDifferencesBaseVersesFormula(bookIndex, bookDifference.BaseVerses, bookDifference.ParallelVerses,
                                                    bookDifference.CorrespondenceType, bookDifference.SkipCheck, bookDifference.EmptyVerse, verseFactory);
            var parallelVersesFormula = new BibleTranslationDifferencesParallelVersesFormula(bookDifference.ParallelVerses, baseVersesFormula,
                bookDifference.CorrespondenceType, valueVersesCount, bookDifference.SkipCheck, bookDifference.EmptyVerse);

            ModuleVersePointer prevVerse = null;
            foreach (var verse in baseVersesFormula.GetAllVerses())
            {
                var parallelVerses = new ComparisonVersesInfo(parallelVersesFormula.GetParallelVerses(verse, prevVerse));

                BibleVersesDifferences[bookIndex].Add(verse, parallelVerses);

                prevVerse = parallelVerses.Last();
            }
        }

        public ModuleVersePointersComparisonTable GetBibleVersesDifferences(int bookIndex)
        {
            if (this.BibleVersesDifferences.ContainsKey(bookIndex))
                return this.BibleVersesDifferences[bookIndex];

            return null;
        }
    }
}
