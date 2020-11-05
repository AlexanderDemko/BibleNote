using AutoMapper;
using BibleNote.Middleware.NavigationProviders.SharedViewModels;
using BibleNote.Providers.OneNote.Contracts;
using MediatR;
using System.Threading;
using System.Threading.Tasks;

namespace BibleNote.Middleware.NavigationProviders.Queries.OneNote.GetHierarchyInfo
{
    public class Handler : IRequestHandler<Request, HierarchyItemVm>
    {
        private readonly IOneNoteAppWrapper oneNoteAppWrapper;
        private readonly IMapper mapper;

        public Handler(IOneNoteAppWrapper oneNoteAppWrapper, IMapper mapper)
        {
            this.oneNoteAppWrapper = oneNoteAppWrapper;
            this.mapper = mapper;
        }

        public async Task<HierarchyItemVm> Handle(Request request, CancellationToken cancellationToken)
        {
            var hierarchyInfo = await this.oneNoteAppWrapper.GetHierarchyInfoAsync(request.HierarchyId);

            return this.mapper.Map<HierarchyItemVm>(hierarchyInfo);
        }
    }
}
