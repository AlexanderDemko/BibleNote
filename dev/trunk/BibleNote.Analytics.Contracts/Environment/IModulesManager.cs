using BibleNote.Analytics.Models.Modules;
using BibleNote.Analytics.Models.Scheme;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Contracts.Environment
{
    public interface IModulesManager
    {
        void CheckModule(ModuleInfo module, BibleNote.Analytics.Models.Modules.ModuleType? moduleType = null);
        void CheckModule(string moduleDirectoryName, BibleNote.Analytics.Models.Modules.ModuleType? moduleType = null);
        void DeleteModule(string moduleShortName);
        int GetBibleChaptersCount(XMLBIBLE bibleInfo, bool addBooksCount);
        int GetBibleChaptersCount(string moduleShortName, bool addBooksCount);        
        XMLBIBLE GetCurrentBibleContent();
        string GetCurrentModuleDirectiory();
        ModuleInfo GetCurrentModuleInfo();
        XMLBIBLE GetModuleBibleContent(string moduleShortName);
        string GetModuleDirectory(string moduleShortName);
        ModuleInfo GetModuleInfo(string moduleShortName);
        List<ModuleInfo> GetModules(bool correctOnly);
        string GetModulesDirectory();
        string GetModulesPackagesDirectory();
        bool ModuleIsCorrect(string moduleName, BibleNote.Analytics.Models.Modules.ModuleType? moduleType = null);
        ModuleInfo ReadModuleInfo(string moduleFilePath);
        void UpdateModuleManifest(ModuleInfo moduleInfo);
        ModuleInfo UploadModule(string originalFilePath, string moduleName);
        void SetCurrentModule(string moduleShortName);
    }
}
