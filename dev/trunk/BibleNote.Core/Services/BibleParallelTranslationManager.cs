using BibleCommon.Scheme;
using BibleNote.Core.Common;
using BibleNote.Core.Contracts;
using BibleNote.Core.Services.System;
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
        private ILogger _logger;
        private IConfigurationManager _configurationManager;
        private IModulesManager _modulesManager;

        public BibleParallelTranslationManager()
        {
            _logger = DIContainer.Resolve<ILogger>();
            _configurationManager = DIContainer.Resolve<IConfigurationManager>();
            _modulesManager = DIContainer.Resolve<IModulesManager>();
        }

        public bool MergeModuleWithMainBible(ModuleInfo parallelModuleInfo)
        {
            if (!string.IsNullOrEmpty(_configurationManager.ModuleShortName)
                && _configurationManager.ModuleShortName != parallelModuleInfo.ShortName)
            {
                try
                {
                    var baseModuleInfo = _modulesManager.GetModuleInfo(_configurationManager.ModuleShortName);

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

                    _modulesManager.UpdateModuleManifest(baseModuleInfo);

                    return true;
                }
                catch (ModuleNotFoundException e) 
                {
                    _logger.LogWarning(e.ToString());
                }
            }

            return false;
        }


        public void RemoveBookAbbreviationsFromMainBible(string parallelModuleName, bool removeAllParallelModulesAbbriviations)
        {
            if (!string.IsNullOrEmpty(_configurationManager.ModuleShortName)
                && _configurationManager.ModuleShortName != parallelModuleName)
            {
                try
                {
                    var baseModuleInfo = _modulesManager.GetModuleInfo(_configurationManager.ModuleShortName);

                    foreach (var baseBook in baseModuleInfo.BibleStructure.BibleBooks)
                    {
                        baseBook.Abbreviations.RemoveAll(abbr =>
                            (removeAllParallelModulesAbbriviations && !string.IsNullOrEmpty(abbr.ModuleName))
                            || (!removeAllParallelModulesAbbriviations && abbr.ModuleName == parallelModuleName));
                    }

                    _modulesManager.UpdateModuleManifest(baseModuleInfo);
                }
                catch (ModuleNotFoundException e) 
                {
                    _logger.LogWarning(e.ToString());
                }
            }
        }

        public void MergeAllModulesWithMainBible()
        {
            foreach (var module in _modulesManager.GetModules(true)
                .Where(m => m.Type == Common.ModuleType.Bible || m.Type == Common.ModuleType.Strong))
            {
                MergeModuleWithMainBible(module);
            }
        }
    }
}
