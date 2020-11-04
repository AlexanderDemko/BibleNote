using MediatR;

namespace BibleNote.Middleware.NavigationProviders.Queries.OneNote.GetHierarchyInfo
{
    public class Request: IRequest<HierarchyItemVm>
    {
        public string HierarchyId { get; set; }

        public Request(string hierarchyId)
        {
            HierarchyId = hierarchyId;
        }
    }
}
