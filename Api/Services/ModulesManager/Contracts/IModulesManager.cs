using System.Collections.Generic;
using BibleNote.Services.ModulesManager.Scheme.Module;
using BibleNote.Services.ModulesManager.Scheme.ZefaniaXml;

namespace BibleNote.Services.ModulesManager.Contracts
{
    public interface IModulesManager
    {
        void CheckModule(ModuleInfo module, Scheme.Module.ModuleType? moduleType = null);

        void CheckModule(string moduleDirectoryName, Scheme.Module.ModuleType? moduleType = null);

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

        bool ModuleIsCorrect(string moduleName, Scheme.Module.ModuleType? moduleType = null);

        ModuleInfo ReadModuleInfo(string moduleFilePath);

        void UpdateModuleManifest(ModuleInfo moduleInfo);

        ModuleInfo UploadModule(string originalFilePath, string moduleName);

        void SetCurrentModule(string moduleShortName);
    }
}
