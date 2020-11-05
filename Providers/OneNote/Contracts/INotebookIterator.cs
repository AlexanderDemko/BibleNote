using BibleNote.Providers.OneNote.Services.Models;
using System.Threading.Tasks;
using static BibleNote.Providers.OneNote.Services.NavigationProvider.NotebookIterator;

namespace BibleNote.Providers.OneNote.Contracts
{
    public interface INotebookIterator
    {
        Task<ContainerInfo> GetHierarchyPagesAsync(string hierarchyId, OneNoteHierarchyType hierarchyType);
    }
}