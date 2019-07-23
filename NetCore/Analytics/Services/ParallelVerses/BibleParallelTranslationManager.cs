using BibleNote.Analytics.Services.ModulesManager.Models.Exceptions;
using BibleNote.Analytics.Services.ModulesManager.Scheme.Module;
using BibleNote.Analytics.Services.ParallelVerses.Contracts;
using Microsoft.Extensions.Logging;
using System;
using System.Collections.Generic;
using System.Linq;

namespace BibleNote.Analytics.Services.ParallelVerses
{
    class BibleParallelTranslationManager : IBibleParallelTranslationManager
    {
        private ILogger<BibleParallelTranslationManager> _log;

        public BibleParallelTranslationManager(ILogger<BibleParallelTranslationManager> log)
        {
            _log = log;
        }

        public bool MergeModuleWithMainBible(ModuleInfo baseModuleInfo, ModuleInfo parallelModuleInfo)
        {
            if (baseModuleInfo != null && baseModuleInfo.ShortName != parallelModuleInfo.ShortName)
            {
                try
                {
                    // merge book abbriviations
                    foreach (var baseBook in baseModuleInfo.BibleStructure.BibleBooks)
                    {
                        var parallelBook = parallelModuleInfo.BibleStructure.BibleBooks.FirstOrDefault(b => b.Index == baseBook.Index);
                        if (parallelBook != null)
                        {
                            foreach (var parallelBookAbbreviation in parallelBook.AllAbbreviations.Values
                                                                                 .Where(abbr => string.IsNullOrEmpty(abbr.ModuleName)))
                            {
                                if (!baseBook.AllAbbreviations.ContainsKey(parallelBookAbbreviation.Value))
                                {
                                    baseBook.Abbreviations.Add(new Abbreviation(parallelBookAbbreviation.Value)
                                    {
                                        ModuleName = parallelModuleInfo.ShortName,
                                        IsFullBookName = parallelBookAbbreviation.IsFullBookName
                                    });
                                }
                            }
                        }
                    }

                    //merge alphabets
                    if (!string.IsNullOrEmpty(parallelModuleInfo.BibleStructure.Alphabet))
                    {
                        foreach (var c in parallelModuleInfo.BibleStructure.Alphabet)
                        {
                            if (!baseModuleInfo.BibleStructure.Alphabet.Contains(c))
                                baseModuleInfo.BibleStructure.Alphabet += c;
                        }
                    }

                    return true;
                }
                catch (ModuleNotFoundException e) 
                {
                    _log.LogWarning(e.ToString());
                }
            }

            return false;
        }


        public void RemoveBookAbbreviationsFromMainBible(
            ModuleInfo baseModuleInfo, 
            string parallelModuleName, 
            bool removeAllParallelModulesAbbriviations)
        {
            if (baseModuleInfo != null && baseModuleInfo.ShortName != parallelModuleName)
            {
                try
                {
                    foreach (var baseBook in baseModuleInfo.BibleStructure.BibleBooks)
                    {
                        baseBook.Abbreviations.RemoveAll(abbr =>
                            (removeAllParallelModulesAbbriviations && !string.IsNullOrEmpty(abbr.ModuleName))
                            || (!removeAllParallelModulesAbbriviations && abbr.ModuleName == parallelModuleName));
                    }
                }
                catch (ModuleNotFoundException e) 
                {
                    _log.LogWarning(e.ToString());
                }
            }
        }

        public void MergeAllModulesWithMainBible(ModuleInfo baseModule, IEnumerable<ModuleInfo> otherModules)
        {
            foreach (var module in otherModules
                .Where(m => m.Type == ModuleType.Bible || m.Type == ModuleType.Strong))
            {
                MergeModuleWithMainBible(baseModule, module);
            }
        }
    }
}
