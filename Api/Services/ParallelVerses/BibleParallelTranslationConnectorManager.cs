using System;
using System.Collections.Generic;
using System.Linq;
using BibleNote.Services.Configuration.Contracts;
using BibleNote.Services.ModulesManager;
using BibleNote.Services.ModulesManager.Contracts;
using BibleNote.Services.ModulesManager.Models;
using BibleNote.Services.ModulesManager.Scheme.Module;
using BibleNote.Services.ParallelVerses.Contracts;
using BibleNote.Services.VerseParsing.Contracts;

namespace BibleNote.Services.ParallelVerses
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
            if (parallelBibleInfo.TryGetValue(baseVersePointer.BookIndex, out ModuleVersePointersComparisonTable parallelBookInfo)
                && parallelBookInfo.TryGetValue(baseVersePointer, out ComparisonVersesInfo verseInfo))
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

                result = GetDirectParallelBibleInfo(baseModuleInfo, parallelModuleInfo);
                if (result == null)
                    result = GetBridgedDirectParallelBibleInfo(baseModuleInfo, parallelModuleInfo, refreshCache);
                if (result == null)
                {
                    result = GetParallelBibleInfo(
                        baseModuleShortName,
                        parallelModuleShortName,
                        baseModuleInfo.BibleTranslationDifferences,
                        parallelModuleInfo.BibleTranslationDifferences,
                        refreshCache);
                }
                else
                {
                    lock (_locker)
                    {
                        if (!_cache.ContainsKey(key))
                            _cache.Add(key, result);
                        else
                            _cache[key] = result;
                    }
                }
            }

            return result;
        }

        private ParallelBibleInfo GetBridgedDirectParallelBibleInfo(
            ModuleInfo baseModule,
            ModuleInfo parallelModule,
            bool refreshCache)
        {
            var parallelMappings = parallelModule.BibleDirectVerseMappings;
            if (parallelMappings != null
                && parallelMappings.SchemaVersion == 1
                && !string.IsNullOrWhiteSpace(parallelMappings.ReferenceModule)
                && !DirectMappingsReference(parallelMappings, baseModule.ShortName))
            {
                EnsureCompatibleVerseIdRegistries(baseModule.BibleDirectVerseMappings, parallelMappings);
                var referenceModule = _modulesManager.GetModuleInfo(parallelMappings.ReferenceModule);
                var baseToReference = GetParallelBibleInfoWithoutBridge(baseModule, referenceModule, refreshCache);
                var referenceToBase = GetParallelBibleInfoWithoutBridge(referenceModule, baseModule, refreshCache);
                var referenceToParallel = BuildDirectParallelBibleInfo(parallelMappings, false);
                return ComposeParallelBibleInfo(baseToReference, referenceToBase, referenceToParallel);
            }

            var baseMappings = baseModule.BibleDirectVerseMappings;
            if (baseMappings != null
                && baseMappings.SchemaVersion == 1
                && !string.IsNullOrWhiteSpace(baseMappings.ReferenceModule)
                && !DirectMappingsReference(baseMappings, parallelModule.ShortName))
            {
                EnsureCompatibleVerseIdRegistries(baseMappings, parallelModule.BibleDirectVerseMappings);
                var referenceModule = _modulesManager.GetModuleInfo(baseMappings.ReferenceModule);
                var baseToReference = BuildDirectParallelBibleInfo(baseMappings, true);
                var referenceToBase = BuildDirectParallelBibleInfo(baseMappings, false);
                var referenceToParallel = GetParallelBibleInfoWithoutBridge(referenceModule, parallelModule, refreshCache);
                return ComposeParallelBibleInfo(baseToReference, referenceToBase, referenceToParallel);
            }

            return null;
        }

        private static void EnsureCompatibleVerseIdRegistries(
            BibleDirectVerseMappings first,
            BibleDirectVerseMappings second)
        {
            if (first == null || second == null
                || first.SchemaVersion != 1 || second.SchemaVersion != 1
                || !string.Equals(first.ReferenceModule, second.ReferenceModule, StringComparison.OrdinalIgnoreCase))
                return;

            var firstRegistry = EffectiveVerseIdRegistry(first);
            var secondRegistry = EffectiveVerseIdRegistry(second);
            if (!string.IsNullOrWhiteSpace(firstRegistry)
                && !string.IsNullOrWhiteSpace(secondRegistry)
                && !string.Equals(firstRegistry, secondRegistry, StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException(
                    $"Direct verse maps use incompatible VerseId registries: '{firstRegistry}' and '{secondRegistry}'.");
        }

        private static string EffectiveVerseIdRegistry(BibleDirectVerseMappings mappings)
        {
            if (!string.IsNullOrWhiteSpace(mappings.VerseIdRegistry))
                return mappings.VerseIdRegistry;
            if (string.Equals(mappings.CanonicalSystem, "biblenote-kjv-v1", StringComparison.OrdinalIgnoreCase))
                return "bnverse:v1";
            return mappings.CanonicalSystem;
        }

        private ParallelBibleInfo GetParallelBibleInfoWithoutBridge(
            ModuleInfo baseModule,
            ModuleInfo parallelModule,
            bool refreshCache)
        {
            return GetDirectParallelBibleInfo(baseModule, parallelModule)
                ?? GetParallelBibleInfo(
                    baseModule.ShortName,
                    parallelModule.ShortName,
                    baseModule.BibleTranslationDifferences,
                    parallelModule.BibleTranslationDifferences,
                    refreshCache);
        }

        private static ParallelBibleInfo ComposeParallelBibleInfo(
            ParallelBibleInfo baseToReference,
            ParallelBibleInfo referenceToBase,
            ParallelBibleInfo referenceToParallel)
        {
            var sources = new HashSet<ModuleVersePointer>();
            foreach (var book in baseToReference.Values)
                foreach (var source in book.Keys)
                    sources.Add((ModuleVersePointer)source.Clone());

            foreach (var referenceBook in referenceToParallel.Values)
            {
                foreach (var reference in referenceBook.Keys)
                {
                    foreach (var source in ResolveParallelPointers(referenceToBase, reference))
                        sources.Add((ModuleVersePointer)source.Clone());
                }
            }

            var result = new ParallelBibleInfo();
            foreach (var source in sources)
            {
                var targets = new ComparisonVersesInfo();
                foreach (var reference in ResolveParallelPointers(baseToReference, source))
                {
                    foreach (var target in ResolveParallelPointers(referenceToParallel, reference))
                    {
                        var value = (ModuleVersePointer)target.Clone();
                        if (!targets.Contains(value))
                            targets.Add(value);
                    }
                }
                if (targets.Count == 0)
                    continue;
                if (!result.TryGetValue(source.BookIndex, out ModuleVersePointersComparisonTable table))
                {
                    table = new ModuleVersePointersComparisonTable();
                    result.Add(source.BookIndex, table);
                }
                table.Add((ModuleVersePointer)source.Clone(), targets);
            }
            return result;
        }

        private static ComparisonVersesInfo ResolveParallelPointers(
            ParallelBibleInfo info,
            ModuleVersePointer source)
        {
            if (info.TryGetValue(source.BookIndex, out ModuleVersePointersComparisonTable table)
                && table.TryGetValue(source, out ComparisonVersesInfo values))
                return values;

            return ComparisonVersesInfo.FromVersePointer((ModuleVersePointer)source.Clone());
        }

        private ParallelBibleInfo GetDirectParallelBibleInfo(ModuleInfo baseModule, ModuleInfo parallelModule)
        {
            if (DirectMappingsReference(parallelModule.BibleDirectVerseMappings, baseModule.ShortName))
                return BuildDirectParallelBibleInfo(parallelModule.BibleDirectVerseMappings, false);

            if (DirectMappingsReference(baseModule.BibleDirectVerseMappings, parallelModule.ShortName))
                return BuildDirectParallelBibleInfo(baseModule.BibleDirectVerseMappings, true);

            return null;
        }

        private static bool DirectMappingsReference(BibleDirectVerseMappings mappings, string moduleShortName)
        {
            return mappings != null
                && mappings.SchemaVersion == 1
                && !string.IsNullOrWhiteSpace(mappings.ReferenceModule)
                && string.Equals(mappings.ReferenceModule, moduleShortName, StringComparison.OrdinalIgnoreCase);
        }

        private static ParallelBibleInfo BuildDirectParallelBibleInfo(BibleDirectVerseMappings mappings, bool reverse)
        {
            var result = new ParallelBibleInfo();
            foreach (var book in mappings.Books ?? Enumerable.Empty<BibleDirectBookMappings>())
            {
                if (book.BookIndex < 1)
                    throw new InvalidOperationException("A direct verse mapping has an invalid book index.");

                foreach (var mapping in book.Mappings ?? Enumerable.Empty<BibleDirectVerseMapping>())
                {
                    var keyChapter = reverse ? mapping.ModuleChapter : mapping.ReferenceChapter;
                    var keyVerse = reverse ? mapping.ModuleVerse : mapping.ReferenceVerse;
                    var valueChapter = reverse ? mapping.ReferenceChapter : mapping.ModuleChapter;
                    var valueVerse = reverse ? mapping.ReferenceVerse : mapping.ModuleVerse;
                    var valueIsEmpty = reverse ? mapping.ReferenceIsEmpty : mapping.ModuleIsEmpty;
                    if (keyChapter < 1 || keyVerse < 1 || valueChapter < 1 || valueVerse < 1)
                        throw new InvalidOperationException("A direct verse mapping has an invalid chapter or verse coordinate.");

                    if (!result.TryGetValue(book.BookIndex, out ModuleVersePointersComparisonTable table))
                    {
                        table = new ModuleVersePointersComparisonTable();
                        result.Add(book.BookIndex, table);
                    }

                    var key = new ModuleVersePointer(book.BookIndex, keyChapter, keyVerse);
                    var value = new ModuleVersePointer(book.BookIndex, valueChapter, valueVerse)
                    {
                        IsEmpty = valueIsEmpty
                    };
                    if (!table.TryGetValue(key, out ComparisonVersesInfo values))
                    {
                        table.Add(key, ComparisonVersesInfo.FromVersePointer(value));
                    }
                    else if (!values.Contains(value))
                    {
                        values.Add(value);
                    }
                }
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
