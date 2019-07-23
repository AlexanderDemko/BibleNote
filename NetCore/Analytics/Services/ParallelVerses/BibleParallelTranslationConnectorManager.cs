using BibleNote.Analytics.Services.Configuration.Contracts;
using BibleNote.Analytics.Services.ModulesManager.Contracts;
using BibleNote.Analytics.Services.ModulesManager.Models;
using BibleNote.Analytics.Services.ModulesManager.Scheme.Module;
using BibleNote.Analytics.Services.ParallelVerses.Contracts;
using BibleNote.Analytics.Services.VerseParsing.Contracts;
using System;
using System.Collections.Generic;
using System.Linq;

namespace BibleNote.Analytics.Services.ParallelVerses
{
    class BibleParallelTranslationConnectorManager : IBibleParallelTranslationConnectorManager
    {
        private readonly IModulesManager _modulesManager;
        private readonly IStringParser _stringParser;
        private readonly IConfigurationManager _configurationManager;

        private static readonly object _locker = new object();

        public BibleParallelTranslationConnectorManager(
            IModulesManager modulesManager, 
            IStringParser stringParser, 
            IConfigurationManager configurationManager)
        {
            _modulesManager = modulesManager;
            _stringParser = stringParser;
            _configurationManager = configurationManager;
        }

        private Dictionary<string, ParallelBibleInfo> _cache = new Dictionary<string, ParallelBibleInfo>();

        private string GetKey(string baseModuleShortName, string parallelModuleShortName)
        {
            return string.Format("{0}_{1}", baseModuleShortName, parallelModuleShortName).ToLower();
        }

        public List<ModuleVersePointer> GetParallelVersePointer(ModuleVersePointer baseVersePointer, string parallelModuleShortName)
        {
            List<ModuleVersePointer> result = null;

            var parallelBibleInfo = GetParallelBibleInfo(parallelModuleShortName, _configurationManager.ModuleShortName);
            var parallelBookInfo = parallelBibleInfo[baseVersePointer.BookIndex];

            if (parallelBookInfo != null && parallelBookInfo.TryGetValue(baseVersePointer, out ComparisonVersesInfo verseInfo))
                result = verseInfo;
            else
                result = new List<ModuleVersePointer>(1) { (ModuleVersePointer)baseVersePointer.Clone() };

            return result;
        }

        public ParallelBibleInfo GetParallelBibleInfo(string baseModuleShortName, string parallelModuleShortName, bool refreshCache = false)
        {
            var key = GetKey(baseModuleShortName, parallelModuleShortName);

            if (refreshCache || !_cache.TryGetValue(key, out ParallelBibleInfo result))
            {
                var baseModuleInfo = _modulesManager.GetModuleInfo(baseModuleShortName);
                var parallelModuleInfo = _modulesManager.GetModuleInfo(parallelModuleShortName);

                result = GetParallelBibleInfo(
                    baseModuleShortName,
                    parallelModuleShortName,
                    baseModuleInfo.BibleTranslationDifferences,
                    parallelModuleInfo.BibleTranslationDifferences,
                    refreshCache);
            }

            return result;
        }

        public ParallelBibleInfo GetParallelBibleInfo(
            string baseModuleShortName, 
            string parallelModuleShortName,
            BibleTranslationDifferences baseBookTranslationDifferences,
            BibleTranslationDifferences parallelBookTranslationDifferences, 
            bool refreshCache = false)
        {
            var key = GetKey(baseModuleShortName, parallelModuleShortName);

            if (refreshCache || !_cache.TryGetValue(key, out ParallelBibleInfo result))
            {
                result = new ParallelBibleInfo();

                if (baseModuleShortName.ToLower() != parallelModuleShortName.ToLower())
                {
                    var verseFactory = new BibleTranslationDifferencesBaseVersesFormula.VerseFactory((s, bookIndex) =>
                    {
                        var verseEntry = _stringParser.TryGetVerse(s, 0);
                        if (verseEntry.VersePointerFound)
                            return verseEntry.VersePointer.ToModuleVersePointer(false, bookIndex);
                        else
                            throw new NotSupportedException($"Verse formula is invalid: {s}");
                    });

                    var baseTranslationDifferencesEx = new BibleTranslationDifferencesEx(baseBookTranslationDifferences, verseFactory);
                    var parallelTranslationDifferencesEx = new BibleTranslationDifferencesEx(parallelBookTranslationDifferences, verseFactory);

                    ProcessForBaseBookVerses(baseTranslationDifferencesEx, parallelTranslationDifferencesEx, result);
                    ProcessForParallelBookVerses(baseTranslationDifferencesEx, parallelTranslationDifferencesEx, result);
                }

                lock (_locker)
                {
                    if (!_cache.ContainsKey(key))
                        _cache.Add(key, result);
                    else
                        _cache[key] = result;
                }
            }

            return result;
        }



        private void ProcessForBaseBookVerses(
            BibleTranslationDifferencesEx baseTranslationDifferencesEx, 
            BibleTranslationDifferencesEx parallelTranslationDifferencesEx,
            ParallelBibleInfo result)
        {
            foreach (int bookIndex in baseTranslationDifferencesEx.BibleVersesDifferences.Keys)
            {
                var bookVersePointersComparisonTables = new ModuleVersePointersComparisonTable();
                result.Add(bookIndex, bookVersePointersComparisonTables);

                var baseBookVerses = baseTranslationDifferencesEx.BibleVersesDifferences[bookIndex];
                var parallelBookVerses = parallelTranslationDifferencesEx.GetBibleVersesDifferences(bookIndex);

                foreach (var baseVerseKey in baseBookVerses.Keys)
                {
                    if (parallelBookVerses != null && parallelBookVerses.TryGetValue(baseVerseKey, out ComparisonVersesInfo parallelVerses))
                    {
                        var baseVerses = baseBookVerses[baseVerseKey];

                        JoinBaseAndParallelVerses(baseVerseKey, baseVerses, parallelVerses, bookVersePointersComparisonTables);
                    }
                    else
                    {
                        var baseVerses = baseBookVerses[baseVerseKey];
                        int? versePartIndex = baseVerses.Count(v => !v.IsApocrypha && !v.IsEmpty) > 1 ? (int?)0 : null;
                        foreach (var baseVersePointer in baseVerses)
                        {
                            parallelVerses = ComparisonVersesInfo.FromVersePointer(
                                new ModuleVersePointer(baseVerseKey)
                                {
                                    PartIndex = versePartIndex.HasValue ? versePartIndex++ : null,
                                    IsEmpty = baseVersePointer.IsApocrypha || baseVerseKey.IsEmpty,
                                    SkipCheck = baseVerseKey.SkipCheck,
                                    EmptyVerseContent = baseVerseKey.EmptyVerseContent
                                });

                            var key = (ModuleVersePointer)baseVersePointer.Clone();
                            key.PartIndex = null;  // нам просто здесь не важно - часть это стиха или нет.
                            bookVersePointersComparisonTables.Add(key, parallelVerses);
                        }
                    }
                }
            }
        }

        private void JoinBaseAndParallelVerses(ModuleVersePointer versesKey, ComparisonVersesInfo baseVerses, ComparisonVersesInfo parallelVerses,
            ModuleVersePointersComparisonTable bookVersePointersComparisonTables)
        {
            if (baseVerses.Count == 1)
            {
                if (parallelVerses.Count == 1 && baseVerses[0].PartIndex.GetValueOrDefault(-1) == parallelVerses[0].PartIndex.GetValueOrDefault(-1))
                {
                    var baseVerseToAdd = (ModuleVersePointer)baseVerses[0].Clone();
                    var parallelVerseToAdd = (ModuleVersePointer)parallelVerses[0].Clone();
                    baseVerseToAdd.PartIndex = null;
                    parallelVerseToAdd.PartIndex = null;
                    if (!bookVersePointersComparisonTables.ContainsKey(baseVerseToAdd))
                        bookVersePointersComparisonTables.Add(baseVerseToAdd, ComparisonVersesInfo.FromVersePointer(parallelVerseToAdd));
                }
                else
                    bookVersePointersComparisonTables.Add(baseVerses[0], parallelVerses);
            }
            else
            {
                var notApocryphaBaseVerses = baseVerses.Where(v => !v.IsApocrypha);
                var notApocryphaParallelVerses = parallelVerses.Where(v => !v.IsApocrypha);

                bool isPartVersePointer = notApocryphaParallelVerses.Count() < notApocryphaBaseVerses.Count();


                int parallelVerseIndex = 0;
                List<ModuleVersePointer> prevParallelVerses = new List<ModuleVersePointer>();

                for (int baseVerseIndex = 0; baseVerseIndex < baseVerses.Count; baseVerseIndex++)
                {
                    var baseVerse = baseVerses[baseVerseIndex];
                    var nextBaseVerse = baseVerseIndex < baseVerses.Count - 1 ? baseVerses[baseVerseIndex + 1] : null;

                    var getAllVerses = nextBaseVerse == null ? GetAllVersesType.All
                                                             : (nextBaseVerse.IsApocrypha != baseVerse.IsApocrypha
                                                                        ? GetAllVersesType.AllOfTheSameType
                                                                        : GetAllVersesType.One);

                    prevParallelVerses = GetParallelVersesList(baseVerse, parallelVerses, ref parallelVerseIndex, getAllVerses, isPartVersePointer, prevParallelVerses);

                    ComparisonVersesInfo parallelVersesInfo = new ComparisonVersesInfo(prevParallelVerses);
                    //parallelVersesInfo.Strict = parallelVerses.Strict;

                    bookVersePointersComparisonTables.Add(baseVerse, parallelVersesInfo);
                }
            }
        }

        private enum GetAllVersesType
        {
            One,
            AllOfTheSameType,
            All
        }

        private List<ModuleVersePointer> GetParallelVersesList(ModuleVersePointer baseVerse, ComparisonVersesInfo parallelVerses, ref int startIndex,
            GetAllVersesType getAllVerses, bool isPartParallelVersePointer, List<ModuleVersePointer> prevParallelVerses)
        {
            var result = new List<ModuleVersePointer>();

            var lastIndex = startIndex;
            var lastPrevVerse = prevParallelVerses.Count > 0 ? prevParallelVerses.Last() : null;
            var partIndex = lastPrevVerse != null ? lastPrevVerse.PartIndex.GetValueOrDefault(-1) + 1 : 0;

            bool getAllFirstOtherTypeVerses = startIndex == 0 && parallelVerses.Count > 0 && !baseVerse.IsApocrypha && parallelVerses[0].IsApocrypha;

            for (int i = startIndex; i < parallelVerses.Count; i++)
            {
                if (parallelVerses[i].IsApocrypha == baseVerse.IsApocrypha || getAllVerses == GetAllVersesType.All || getAllFirstOtherTypeVerses)
                {
                    var parallelVerseToAdd = (ModuleVersePointer)parallelVerses[i].Clone();

                    if (!parallelVerseToAdd.IsApocrypha)
                        parallelVerseToAdd.PartIndex = (isPartParallelVersePointer && getAllVerses != GetAllVersesType.One) ? (int?)partIndex++ : parallelVerseToAdd.PartIndex;
                    else if (parallelVerseToAdd.PartIndex.HasValue)
                        throw new NotSupportedException(string.Format("Apocrypha part verses are not supported yet. Parallel verse is '{0}'.", parallelVerseToAdd));

                    result.Add(parallelVerseToAdd);

                    lastIndex = i + 1;
                }
                else
                {
                    if (getAllVerses != GetAllVersesType.All && result.Count > 0) // то есть IsApocrypha сменилась
                        break;

                    if (getAllVerses == GetAllVersesType.AllOfTheSameType && startIndex == 0)  // то есть сразу не то пошло
                        break;
                }

                if (getAllVerses == GetAllVersesType.One && (!getAllFirstOtherTypeVerses || result.Any(v => v.IsApocrypha == baseVerse.IsApocrypha)))
                    break;
            }
            startIndex = lastIndex;

            if (result.Count == 0)
            {
                ModuleVersePointer parallelVerseToAdd = null;

                if (!baseVerse.IsApocrypha)
                {
                    if (lastPrevVerse != null)
                    {
                        if (!lastPrevVerse.PartIndex.HasValue)
                            lastPrevVerse.PartIndex = partIndex++;

                        parallelVerseToAdd = (ModuleVersePointer)lastPrevVerse.Clone();
                        parallelVerseToAdd.PartIndex = isPartParallelVersePointer ? (int?)partIndex++ : null;
                    }
                    else
                        throw new NotSupportedException(string.Format("Can not find parallel value verse for base verse '{0}'.", baseVerse));
                }
                else
                {
                    parallelVerseToAdd = (ModuleVersePointer)baseVerse.Clone();
                    parallelVerseToAdd.IsEmpty = true;
                }

                result.Add(parallelVerseToAdd);
            }

            return result;
        }

        private void ProcessForParallelBookVerses(
            BibleTranslationDifferencesEx baseTranslationDifferencesEx, 
            BibleTranslationDifferencesEx parallelTranslationDifferencesEx,
            ParallelBibleInfo result)
        {
            foreach (int bookIndex in parallelTranslationDifferencesEx.BibleVersesDifferences.Keys)
            {
                if (!result.TryGetValue(bookIndex, out ModuleVersePointersComparisonTable bookVersePointersComparisonTables))
                {
                    bookVersePointersComparisonTables = new ModuleVersePointersComparisonTable();
                    result.Add(bookIndex, bookVersePointersComparisonTables);
                }

                var baseBookVerses = baseTranslationDifferencesEx.GetBibleVersesDifferences(bookIndex);
                var parallelBookVerses = parallelTranslationDifferencesEx.BibleVersesDifferences[bookIndex];

                foreach (var parallelVerseKVP in parallelBookVerses)
                {
                    if (baseBookVerses == null || !baseBookVerses.ContainsKey(parallelVerseKVP.Key))   // вариант, когда и там, и там есть, мы уже разобрали                    
                    {
                        bookVersePointersComparisonTables.Add(parallelVerseKVP.Key, parallelVerseKVP.Value);
                    }
                }
            }
        }
    }
}
