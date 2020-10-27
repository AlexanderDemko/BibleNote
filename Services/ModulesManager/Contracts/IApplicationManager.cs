using BibleNote.Services.ModulesManager.Scheme.Module;
using BibleNote.Services.ModulesManager.Scheme.ZefaniaXml;

namespace BibleNote.Services.ModulesManager.Contracts
{
    public interface IApplicationManager
    {
        ModuleInfo CurrentModuleInfo { get; }

        XMLBIBLE CurrentBibleContent { get; }

        XMLBIBLE GetBibleContent(string moduleShortName);

        void ReloadInfo();
    }
}
