import * as Babel from '@babel/types';

export interface EventBind {
  selector: string, 
  event: string,
  fun: Babel.FunctionDeclaration
}

export interface StateDefinition {
  name: string,
  defaultValue: Babel.Expression | undefined,
}

export interface Component {
  name: string | null
  imports: Babel.ImportDeclaration[]
  funcs: Babel.FunctionDeclaration[]

  constructr: Babel.FunctionDeclaration | null
  didMount: Babel.FunctionDeclaration | null
  willUnmount: Babel.FunctionDeclaration | null

  helpers: Babel.FunctionDeclaration[]
  events: EventBind[]

  props: string[]
  state: StateDefinition[]
}