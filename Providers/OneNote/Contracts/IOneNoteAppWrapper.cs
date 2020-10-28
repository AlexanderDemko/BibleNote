using Microsoft.Office.Interop.OneNote;
using System;
using System.Threading.Tasks;
using System.Xml.Linq;

namespace BibleNote.Providers.OneNote.Contracts
{
    public interface IOneNoteAppWrapper : IDisposable
    {
        Task<string> GetPageContentAsync(string pageId, PageInfo pageInfo = PageInfo.piBasic);
        Task<string> GetHierarchyContentAsync(string hierarchyId, HierarchyScope scope);
        Task<string> GetCurrentPageIdAsync();
        Task UpdatePageContentAsync(XDocument pageDoc);
    }
}