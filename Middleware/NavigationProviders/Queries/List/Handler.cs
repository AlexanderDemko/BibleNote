﻿using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using AutoMapper;
using BibleNote.Domain.Contracts;
using BibleNote.Middleware.NavigationProviders.SharedViewModels;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace BibleNote.Middleware.NavigationProviders.Queries.List
{
    public class Handler : IRequestHandler<Request, List<NavigationProviderVm>>
    {
        private readonly IReadOnlyDbContext dbContext;
        private readonly IMapper mapper;

        public Handler(IReadOnlyDbContext dbContext, IMapper mapper)
        {
            this.dbContext = dbContext;
            this.mapper = mapper;
        }

        public Task<List<NavigationProviderVm>> Handle(Request request, CancellationToken cancellationToken)
        {
            return this.mapper
                .ProjectTo<NavigationProviderVm>(this.dbContext.NavigationProvidersInfo)
                .ToListAsync(cancellationToken);
        }
    }
}
