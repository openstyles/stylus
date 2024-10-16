const Combinators = [];
/*  \t   */ Combinators[9] =
/*  \n   */ Combinators[10] =
/*  \f   */ Combinators[12] =
/*  \r   */ Combinators[13] =
/*  " "  */ Combinators[32] = 'descendant';
/*   >   */ Combinators[62] = 'child';
/*   +   */ Combinators[43] = 'adjacent-sibling';
/*   ~   */ Combinators[126] = 'sibling';
/*  ||   */ Combinators[124] = 'column';

export default Combinators;
