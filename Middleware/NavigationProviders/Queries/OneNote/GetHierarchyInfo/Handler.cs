using BibleNote.Providers.OneNote.Contracts;
using MediatR;
using System.Threading;
using System.Threading.Tasks;

namespace BibleNote.Middleware.NavigationProviders.Queries.OneNote.GetHierarchyInfo
{
    public class Handler : IRequestHandler<Request, HierarchyItemVm>
    {
        private readonly IOneNoteAppWrapper oneNoteAppWrapper;

        public Handler(IOneNoteAppWrapper oneNoteAppWrapper)
        {
            this.oneNoteAppWrapper = oneNoteAppWrapper;
        }

        public async Task<HierarchyItemVm> Handle(Request request, CancellationToken cancellationToken)
        {
            var hierarchyName = await this.oneNoteAppWrapper.GetHierarchyNameAsync(request.HierarchyId);

            return new HierarchyItemVm() { Id = request.HierarchyId, Name = hierarchyName, Type = ? };
        }
    }
}
