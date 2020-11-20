using AutoMapper;
using BibleNote.Domain.Contracts;
using BibleNote.Middleware.AnalysisSessions.SharedViewModels;
using MediatR;
using Microsoft.EntityFrameworkCore;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace BibleNote.Middleware.AnalysisSessions.Queries.List
{
    public class Handler : IRequestHandler<Request, List<AnalysisSessionVm>>
    {
        private readonly IReadOnlyDbContext dbContext;
        private readonly IMapper mapper;

        public Handler(IReadOnlyDbContext dbContext, IMapper mapper)
        {
            this.dbContext = dbContext;
            this.mapper = mapper;
        }

        public Task<List<AnalysisSessionVm>> Handle(Request request, CancellationToken cancellationToken)
        {
            var query = this.dbContext.AnalysisSessions.AsQueryable();

            if (request.NavigationProviderId.HasValue)
                query = query.Where(s => s.NavigationProviderId == request.NavigationProviderId);

            if (request.OnlyLatest)
            {
                query = query
                    .GroupBy(s => s.NavigationProviderId)
                    .Select(gs => gs
                                    .OrderByDescending(s => s.StartTime ?? DateTime.MaxValue)
                                    .First()
                    );
            }

            return this.mapper
               .ProjectTo<AnalysisSessionVm>(query)
               .ToListAsync(cancellationToken);
        }
    }
}
