using BibleNote.Analytics.Services.ModulesManager.Scheme.Module;
using BibleNote.Analytics.Services.ModulesManager.Scheme.ZefaniaXml;

namespace BibleNote.Analytics.Services.ModulesManager.Contracts
{
    public interface IApplicationManager
    {
        ModuleInfo CurrentModuleInfo { get; }

        XMLBIBLE CurrentBibleContent { get; }

        XMLBIBLE GetBibleContent(string moduleShortName);

        void ReloadInfo();
    }
}
