﻿using BibleCommon.Scheme;
using BibleNote.Core.Common;
using BibleNote.Core.Contracts;
using BibleNote.Core.Services.System;
using Microsoft.Practices.Unity;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Xml.Linq;

namespace BibleNote.Core.Services
{
    public class BibleParallelTranslationManager : IBibleParallelTranslationManager
    {
        [Dependency]
        public ILogger Logger { get; set; }

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
                    Logger.LogWarning(e.ToString());
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
                    Logger.LogWarning(e.ToString());
                }
            }
        }

        public void MergeAllModulesWithMainBible(ModuleInfo baseModule, IEnumerable<ModuleInfo> otherModules)
        {
            foreach (var module in otherModules
                .Where(m => m.Type == Common.ModuleType.Bible || m.Type == Common.ModuleType.Strong))
            {
                MergeModuleWithMainBible(baseModule, module);
            }
        }
    }
}
