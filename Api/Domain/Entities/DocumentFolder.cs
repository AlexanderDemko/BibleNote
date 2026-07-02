using System.Collections;
using System.Collections.Generic;

namespace BibleNote.Domain.Entities
{
    public class DocumentFolder
    {
        public int Id { get; set; }

        public string Name { get; set; }

        /// <summary>
        /// Folder Identificator. For FileNavigationProvider is folderPath, for OneNoteNavigationProvider is sectionId/sectionGroupId/notebookId.
        /// </summary>
        public string Path { get; set; }

        public int? ParentFolderId { get; set; }
        public DocumentFolder ParentFolder { get; set; }

        public int NavigationProviderId { get; set; }
        public NavigationProviderInfo NavigationProvider { get; set; }

        public int? LatestAnalysisSessionId { get; set; }
        public AnalysisSession LatestAnalysisSession { get; set; }

        public ICollection<DocumentFolder> ChildrenFolders { get; set; }

        public override int GetHashCode()
        {
            return Id.GetHashCode();
        }

        public override bool Equals(object obj)
        {
            return Id == ((DocumentFolder)obj).Id;
        }
    }
}
