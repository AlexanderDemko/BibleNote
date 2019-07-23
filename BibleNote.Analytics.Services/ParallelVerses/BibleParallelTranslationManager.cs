using BibleNote.Analytics.Contracts.Logging;
using BibleNote.Analytics.Contracts.ParallelVerses;
using BibleNote.Analytics.Models.Exceptions;
using BibleNote.Analytics.Models.Modules;
using Microsoft.Practices.Unity;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Xml.Linq;

namespace BibleNote.Analytics.Services.ParallelVerses
{
    public class BibleParallelTranslationManager : IBibleParallelTranslationManager
    {
        private ILog _log;

        public BibleParallelTranslationManager(ILog log)
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
                            foreach (var parallelBookAbbreviation in parallelBook.AllAbbreviations.Values.Where(abbr => string.IsNullOrEmpty(abbr.ModuleName)))
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
                    _log.Write(LogLevel.Warning, e.ToString());
                }
            }

            return false;
        }


        public void RemoveBookAbbreviationsFromMainBible(ModuleInfo baseModuleInfo, string parallelModuleName, bool removeAllParallelModulesAbbriviations)
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
                    _log.Write(LogLevel.Warning, e.ToString());
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
