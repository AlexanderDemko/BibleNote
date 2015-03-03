using BibleCommon.Scheme;
using BibleNote.Core.Common;
using BibleNote.Core.Contracts;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Xml.Linq;

namespace BibleNote.Core.Services
{
    public class BibleParallelTranslationManager
    {   
        public static bool MergeModuleWithMainBible(ModuleInfo parallelModuleInfo)
        {
            if (!string.IsNullOrEmpty(Application.ConfigurationManager.ModuleShortName)
                && Application.ConfigurationManager.ModuleShortName != parallelModuleInfo.ShortName)
            {
                try
                {
                    var baseModuleInfo = Application.ModulesManager.GetModuleInfo(Application.ConfigurationManager.ModuleShortName);

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

                    Application.ModulesManager.UpdateModuleManifest(baseModuleInfo);

                    return true;
                }
                catch (ModuleNotFoundException) { }
            }

            return false;
        }


        public static void RemoveBookAbbreviationsFromMainBible(string parallelModuleName, bool removeAllParallelModulesAbbriviations)
        {
            if (!string.IsNullOrEmpty(Application.ConfigurationManager.ModuleShortName)
                && Application.ConfigurationManager.ModuleShortName != parallelModuleName)
            {
                try
                {
                    var baseModuleInfo = Application.ModulesManager.GetModuleInfo(Application.ConfigurationManager.ModuleShortName);

                    foreach (var baseBook in baseModuleInfo.BibleStructure.BibleBooks)
                    {
                        baseBook.Abbreviations.RemoveAll(abbr =>
                            (removeAllParallelModulesAbbriviations && !string.IsNullOrEmpty(abbr.ModuleName))
                            || (!removeAllParallelModulesAbbriviations && abbr.ModuleName == parallelModuleName));
                    }

                    Application.ModulesManager.UpdateModuleManifest(baseModuleInfo);
                }
                catch (ModuleNotFoundException) { }
            }
        }

        public static void MergeAllModulesWithMainBible()
        {
            foreach (var module in Application.ModulesManager.GetModules(true)
                .Where(m => m.Type == Common.ModuleType.Bible || m.Type == Common.ModuleType.Strong))
            {
                BibleParallelTranslationManager.MergeModuleWithMainBible(module);
            }
        }
    }
}
